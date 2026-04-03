"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Scan, Maximize, Bluetooth, Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { ensureBluetooth } from "@/lib/ensureBluetooth";

interface OfflineScannerSimProps {
  onScan: (upi: string, bleId: string) => void;
  onCancel: () => void;
}

/**
 * Parse both unified upi:// and legacy edgepay:// QR formats.
 * Returns { upi, ble } — ble may be empty string for plain UPI QRs.
 */
function parseQRPayload(raw: string): { upi: string; ble: string } | null {
  try {
    // Unified format: upi://pay?pa=user@paytm&pn=Name&ble=EDGE-1234
    if (raw.startsWith("upi://")) {
      // Replace url scheme so URL() can parse it
      const url = new URL(raw.replace("upi://pay", "https://x.invalid/pay").replace("upi://", "https://x.invalid/"));
      const pa = url.searchParams.get("pa") || url.searchParams.get("upi");
      const ble = url.searchParams.get("ble") || "";
      if (pa) return { upi: pa, ble };
    }
    // Legacy format: edgepay://p2p?upi=...&ble=...
    if (raw.startsWith("edgepay://")) {
      const url = new URL(raw.replace("edgepay://", "https://x.invalid/"));
      const upiParam = url.searchParams.get("upi");
      const ble = url.searchParams.get("ble") || "";
      if (upiParam) return { upi: upiParam, ble };
    }
    // Plain UPI ID (contains @)
    if (raw.includes("@")) {
      return { upi: raw.trim(), ble: "" };
    }
  } catch {}
  return null;
}

export default function OfflineScannerSim({ onScan, onCancel }: OfflineScannerSimProps) {
  const [pastePayload, setPastePayload] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [btStatus, setBtStatus] = useState<"idle" | "enabling" | "ready" | "failed">("idle");

  const startNativeScan = useCallback(async () => {
    setScanError("");
    setIsScanning(true);

    // ── Auto-enable Bluetooth before scan ────────────────────────────────
    setBtStatus("enabling");
    const btOn = await ensureBluetooth();
    setBtStatus(btOn ? "ready" : "failed");
    // We continue even if BT failed — the QR might be for an online-only payment

    try {
      // Dynamically import to avoid SSR + web-build errors
      const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import("@capacitor/barcode-scanner");

      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        scanInstructions: "Aim at the receiver's EdgePay QR code",
        scanButton: false,
      });

      if (result?.ScanResult) {
        const parsed = parseQRPayload(result.ScanResult);
        if (parsed) {
          onScan(parsed.upi, parsed.ble);
        } else {
          setScanError("Unrecognised QR code. Please scan a valid UPI or EdgePay QR.");
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("dismiss")) {
        setScanError("Scanner error: " + msg);
      }
    } finally {
      setIsScanning(false);
    }
  }, [onScan]);

  const handleManualSubmit = () => {
    const parsed = parseQRPayload(pastePayload.trim());
    if (parsed) {
      onScan(parsed.upi, parsed.ble);
    } else {
      setScanError("Invalid QR payload. Try a upi:// URL or a plain UPI ID like merchant@paytm");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center h-[70vh]">
      {/* Animated icon */}
      <motion.div
        animate={isScanning ? { scale: [1, 1.08, 1], opacity: [1, 0.7, 1] } : { scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: isScanning ? 0.8 : 2 }}
        className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center relative mb-6 border border-blue-200 dark:border-blue-800"
      >
        <Maximize size={40} className="text-[#00B9F1] absolute stroke-1" />
        {isScanning ? (
          <Loader2 size={28} className="text-[#00B9F1] animate-spin" />
        ) : (
          <Scan size={30} className="text-blue-500" />
        )}
      </motion.div>

      <h2 className="text-[22px] font-black text-gray-900 dark:text-white mb-2">
        {btStatus === "enabling" ? "Enabling Bluetooth..." : isScanning ? "Opening Camera..." : "Scan QR to Pay"}
      </h2>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-[280px] leading-relaxed mb-6">
        {Capacitor.isNativePlatform()
          ? "Tap the button below to open your camera and scan the receiver's QR code."
          : "Browser Simulator — paste a upi:// URL or plain UPI ID to simulate a scan."}
      </p>

      {/* Native scan button */}
      {Capacitor.isNativePlatform() && (
        <button
          onClick={startNativeScan}
          disabled={isScanning}
          className="w-full mb-4 py-4 bg-[#00B9F1] text-white font-bold rounded-xl text-[15px] active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isScanning ? (
            <><Loader2 size={18} className="animate-spin" /> Scanning...</>
          ) : (
            <><Scan size={18} /> Open Camera Scanner</>
          )}
        </button>
      )}

      {/* Web paste fallback (shown always on web, optional helper on native) */}
      {!Capacitor.isNativePlatform() && (
        <div className="w-full mb-4">
          <input
            type="text"
            value={pastePayload}
            onChange={(e) => { setPastePayload(e.target.value); setScanError(""); }}
            className="w-full h-12 px-4 rounded-xl text-[14px] font-mono outline-none border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] bg-[#F5F7F8] dark:bg-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400"
            placeholder="upi://pay?pa=merchant@paytm&ble=EDGE-1234"
            onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
          />
          {scanError && (
            <p className="text-red-500 text-[12px] font-bold mt-1 text-left px-1">{scanError}</p>
          )}
          <button
            onClick={handleManualSubmit}
            disabled={!pastePayload.trim()}
            className="w-full mt-3 py-3 bg-[#00B9F1] text-white font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-40"
          >
            Simulate Scan Success
          </button>
        </div>
      )}

      {/* Native scan error */}
      {Capacitor.isNativePlatform() && scanError && (
        <p className="text-red-500 text-[12px] font-bold mb-4 max-w-[280px]">{scanError}</p>
      )}

      <div className={`flex items-center gap-2 mt-auto px-4 py-2.5 rounded-xl border ${
        btStatus === "failed"
          ? "text-red-500 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50"
          : btStatus === "ready"
          ? "text-green-600 bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/50"
          : "text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50"
      }`}>
        <Bluetooth size={16} className={btStatus === "enabling" ? "animate-pulse" : ""}  />
        <span className="text-[11px] font-bold">
          {btStatus === "enabling" ? "Turning on Bluetooth..." :
           btStatus === "ready"    ? "Bluetooth ON — BLE Handshake Ready ✓" :
           btStatus === "failed"   ? "Bluetooth OFF — online-only payment" :
                                    "Encrypted BLE Handshake Ready"}
        </span>
      </div>

      <button
        onClick={onCancel}
        className="mt-6 text-[14px] font-bold text-gray-500 border border-gray-200 dark:border-gray-800 px-6 py-2 rounded-full"
      >
        Cancel
      </button>
    </div>
  );
}
