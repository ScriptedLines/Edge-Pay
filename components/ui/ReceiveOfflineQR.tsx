"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { ShieldAlert, Zap, Smartphone, CheckCircle2, Wifi, WifiOff, Bluetooth, ScanLine } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { CapacitorBarcodeScanner } from "@capacitor/barcode-scanner";
import { ensureBluetooth } from "@/lib/ensureBluetooth";

interface ReceiveOfflineQRProps {
  upiId: string;
  bleDeviceId: string;
  onClose: () => void;
}

export default function ReceiveOfflineQR({ upiId, bleDeviceId, onClose }: ReceiveOfflineQRProps) {
  const [receivedAmount, setReceivedAmount] = useState<number | null>(null);
  const [settledOnline, setSettledOnline] = useState(false);
  const [senderName, setSenderName] = useState("Sender");
  const [btStatus, setBtStatus] = useState<"enabling" | "on" | "off">("enabling");
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable BLE device ID for this session (avoid re-render noise)
  const stableBleId = useRef(bleDeviceId).current;

  // ── Auto-enable Bluetooth as soon as receiver opens this screen ────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) { setBtStatus("on"); return; }
    ensureBluetooth().then(ok => setBtStatus(ok ? "on" : "off"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Unified QR payload — standard UPI format with an extra &ble= param.
   * Any UPI app (GPay, PhonePe) will read pa= and make a normal online payment.
   * EdgePay reads &ble= and routes via BLE if offline.
   */
  const payload = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=EdgePayUser&ble=${encodeURIComponent(stableBleId)}&cu=INR`;

  // Listen for cross-tab / same-browser BLE simulation via localStorage
  useEffect(() => {
    const handleStorage = async (e: StorageEvent) => {
      if (e.key === `ble_payload_${stableBleId}` && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          handleReceivedPayload(data);
        } catch {}
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [stableBleId]);

  const handleReceivedPayload = async (data: any) => {
    if (!data.amount) return;

    const amount = Number(data.amount);
    const sender = data.sender || "Unknown Sender";
    const token = data.token ?? data.tokenId;

    setSenderName(sender);
    setReceivedAmount(amount);
    // If the receiver is already online the settlement will happen automatically
    // when the sender reconnects — no action needed on the receiver's side.
    setSettledOnline(navigator.onLine);

    // Auto-close after 6 s so the receiver is never stuck waiting for an action.
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    autoDismissRef.current = setTimeout(() => onClose(), 6000);

    const txs = JSON.parse(localStorage.getItem("paytm_transactions") || "[]");

    const newTx = {
      id: `recv-${Date.now()}`,
      date: Date.now(),
      title: "Edge Pay — Pending UPI",
      target: sender,
      amount,
      type: "credit",
      settled: false,
      edgePending: true as const,
      ...(token ? { token } : {}),
    };

    localStorage.setItem("paytm_transactions", JSON.stringify([newTx, ...txs]));

    const credits = JSON.parse(localStorage.getItem("paytm_pending_credits") || "[]");
    localStorage.setItem("paytm_pending_credits", JSON.stringify([...credits, newTx]));

    const notifications = JSON.parse(localStorage.getItem("paytm_notifications") || "[]");
    notifications.unshift({
      id: `n-${Date.now()}`,
      title: "Edge Pay wallet credited",
      desc: `₹${amount.toLocaleString("en-IN")} from ${sender} is in your Edge wallet. Bank/UPI credits when the sender reconnects and settles.`,
      icon: "zap",
      ts: Date.now(),
    });
    localStorage.setItem("paytm_notifications", JSON.stringify(notifications.slice(0, 30)));
    localStorage.setItem("paytm_unread", String(Number(localStorage.getItem("paytm_unread") || "0") + 1));

    const trustPoints = Number(localStorage.getItem("paytm_trust_points") || "0");
    localStorage.setItem("paytm_trust_points", String(trustPoints + 2));

    window.dispatchEvent(new Event("offline_receive"));
    window.dispatchEvent(new Event("edgepay_refresh"));
    localStorage.removeItem(`ble_payload_${stableBleId}`);
  };

  const handleReverseScan = async () => {
    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: 0,
        cameraDirection: 1
      });
      if (result.ScanResult) {
        const url = new URL(result.ScanResult);
        if (url.protocol === "edgepay:" && url.hostname === "collect") {
          const payloadStr = url.searchParams.get("payload");
          if (payloadStr) {
            const data = JSON.parse(payloadStr);
            handleReceivedPayload(data);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ── Listen for Global Payment Events (Online or Offline) ──────────────────
  useEffect(() => {
    const handleRefresh = () => {
      const lastPoll = localStorage.getItem("last_received_poll");
      if (lastPoll) {
        try {
          const data = JSON.parse(lastPoll);
          // Only trigger if it's very recent (last 10 seconds)
          if (Date.now() - data.ts < 10000) {
            setSenderName(data.sender);
            setReceivedAmount(data.amount);
            setSettledOnline(true);
            // Clear it so we don't trigger twice
            localStorage.removeItem("last_received_poll");
          }
        } catch (e) {}
      }
    };

    window.addEventListener("edgepay_refresh", handleRefresh);
    window.addEventListener("offline_receive", handleRefresh);
    
    // Check once on mount in case it happened just before opening
    handleRefresh();

    return () => {
      window.removeEventListener("edgepay_refresh", handleRefresh);
      window.removeEventListener("offline_receive", handleRefresh);
    };
  }, []);

  return (
    <div className="flex flex-col items-center pb-8 p-6 text-center">
      <div className="w-16 h-1 bg-gray-200 dark:bg-gray-800 rounded-full mb-6 mx-auto" />

      {receivedAmount ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center py-10"
        >
          <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.4)] mb-6">
            <CheckCircle2 size={50} className="text-white" />
          </div>
          <h2 className="text-[36px] font-black text-green-600 dark:text-green-500">
            ₹{receivedAmount.toLocaleString("en-IN")}
          </h2>
          <p className="text-[15px] text-gray-500 font-bold mt-2">
            Received from {senderName}
          </p>

          {/* Settlement Status Badge */}
          <div className={`flex items-center gap-2 mt-4 px-4 py-2 rounded-xl border ${settledOnline ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}>
            {settledOnline ? (
              <>
                <Wifi size={14} className="text-green-600" />
                <span className="text-[12px] font-bold text-green-700 dark:text-green-400">
                  Payment guaranteed — auto-settling to your bank ✓
                </span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-amber-600" />
                <span className="text-[12px] font-bold text-amber-700 dark:text-amber-400">
                  Saved to Edge wallet — credits when sender reconnects
                </span>
              </>
            )}
          </div>
          {settledOnline && (
            <p className="text-[11px] text-gray-400 mt-1 text-center">Closing automatically…</p>
          )}

          <p className="text-[12px] text-gray-400 mt-3 max-w-[250px] leading-relaxed">
            Transaction signed over {Capacitor.isNativePlatform() ? "Bluetooth LE" : "Radio Mock"}.
          </p>
          <button
            onClick={onClose}
            className="mt-8 px-8 py-3 bg-[#00B9F1] text-white font-bold rounded-2xl active:scale-95 transition-transform"
          >
            Done
          </button>
        </motion.div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={22} className="text-[#00B9F1]" />
            <h2 className="text-[20px] font-black text-gray-900 dark:text-white">Receive Payment</h2>
          </div>

          {/* Dual-mode badge */}
          <div className="flex items-center gap-1.5 mb-4 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-full border border-blue-100 dark:border-blue-800">
            <Wifi size={11} className="text-[#00B9F1]" />
            <span className="text-[11px] font-bold text-[#00B9F1]">Works Online & Offline</span>
          </div>

          <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-[280px] leading-relaxed mb-6">
            Any UPI app can scan this for an online payment. EdgePay uses it offline via Bluetooth when internet is unavailable.
          </p>

          <div className="bg-white p-5 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border-[3px] border-blue-50">
            <QRCodeSVG
              value={payload}
              size={220}
              bgColor={"#ffffff"}
              fgColor={"#0f172a"}
              level={"H"}
              includeMargin={false}
            />
          </div>

          <div className="flex flex-col items-start gap-1 mt-4 p-3 bg-gray-50 dark:bg-[#1A1A1A] rounded-2xl w-full border border-gray-100 dark:border-gray-800 text-left">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">UPI ID</span>
            <code className="text-[13px] font-mono font-bold text-gray-700 dark:text-gray-200">{upiId}</code>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1.5">BLE Broadcast ID</span>
            <code className="text-[12px] font-mono font-bold text-gray-500 dark:text-gray-400 tracking-wider">{stableBleId}</code>
          </div>

          <div className={`flex items-center gap-2 mt-4 w-full justify-center px-4 py-2.5 rounded-xl ${
            btStatus === "enabling" ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800" :
            btStatus === "on"       ? "text-green-600 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800" :
                                     "text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800"
          }`}>
            <Bluetooth size={16} className={btStatus === "enabling" ? "animate-pulse shrink-0" : "shrink-0"} />
            <span className="text-[11px] font-bold">
              {btStatus === "enabling" ? "Enabling Bluetooth..." :
               btStatus === "on"       ? "Bluetooth ON — Listening for BLE payment ✓" :
                                        "Bluetooth OFF — turn on manually for offline pay"}
            </span>
          </div>

          <button
            onClick={handleReverseScan}
            className="mt-6 flex items-center justify-center gap-2 w-full py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-2xl active:scale-95 transition-transform"
          >
            <ScanLine size={18} />
            Scan Sender's Receipt
          </button>
        </>
      )}
    </div>
  );
}
