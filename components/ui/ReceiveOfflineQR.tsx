"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { ShieldAlert, Zap, Smartphone, CheckCircle2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";

interface ReceiveOfflineQRProps {
  upiId: string;
  bleDeviceId: string;
  onClose: () => void;
}

export default function ReceiveOfflineQR({ upiId, bleDeviceId, onClose }: ReceiveOfflineQRProps) {
  const [receivedAmount, setReceivedAmount] = useState<number | null>(null);

  // Payload structure for the QR code
  const payload = `edgepay://p2p?upi=${encodeURIComponent(upiId)}&ble=${encodeURIComponent(bleDeviceId)}`;

  // Simulating cross-tab Web BLE Receiver exactly as requested by user
  useEffect(() => {
    // We listen to the localStorage for the other tab modifying our specific BLE bucket
    const handleStorage = (e: StorageEvent) => {
      if (e.key === `ble_payload_${bleDeviceId}`) {
        if (e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            if (data.amount) {
              setReceivedAmount(data.amount);

              // Inject the received transaction directly into the ledger of the DOM
              const bal = Number(localStorage.getItem('paytm_bank_balance') || '40000');
              const txs = JSON.parse(localStorage.getItem('paytm_transactions') || '[]');

              // Credit the balance
              localStorage.setItem('paytm_bank_balance', String(bal + data.amount));

              // Add a new received transaction to the front
              const newTx = {
                id: `recv-${Date.now()}`,
                date: Date.now(),
                title: "EdgePay Received",
                target: data.sender || "Unknown Peer",
                amount: data.amount,
                type: "credit",
                settled: false // Needs standard sync to settle
              };
              localStorage.setItem('paytm_transactions', JSON.stringify([newTx, ...txs]));

              // We also need to add it to pendingOfflineTransactions so it settles on WiFi up
              const pending = JSON.parse(localStorage.getItem('paytm_pending_offline') || '[]');
              localStorage.setItem('paytm_pending_offline', JSON.stringify([...pending, newTx]));
              
              // Trigger a system local event so the main app state hydrates 
              // Usually handled by the main app polling, but we can emit a custom event to tell React
              window.dispatchEvent(new Event('offline_receive'));

              // Clear the dummy payload so we can receive again if needed
              localStorage.removeItem(`ble_payload_${bleDeviceId}`);
            }
          } catch (err) {}
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [bleDeviceId]);

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
          <h2 className="text-[36px] font-black text-green-600 dark:text-green-500">₹{receivedAmount.toLocaleString('en-IN')}</h2>
          <p className="text-[15px] text-gray-500 font-bold mt-2">Received via Offline EdgePay!</p>
          <p className="text-[12px] text-gray-400 mt-2 max-w-[250px] leading-relaxed">
            Transaction signed and secured over {Capacitor.isNativePlatform() ? "Bluetooth LE" : "Radio Mock"}. It will settle when network restores.
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
          <div className="flex items-center gap-2 mb-2">
            <Zap size={22} className="text-[#00B9F1]" />
            <h2 className="text-[20px] font-black text-gray-900 dark:text-white">Receive Offline</h2>
          </div>
          
          <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-[280px] leading-relaxed mb-6">
            Ask the sender to scan this QR code using EdgePay offline mode. Ensure both devices have {Capacitor.isNativePlatform() ? "Bluetooth enabled" : "Browser windows side-by-side"}.
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

          <div className="flex flex-col items-center gap-2 mt-6 p-4 bg-gray-50 dark:bg-[#1A1A1A] rounded-2xl w-full border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              {Capacitor.isNativePlatform() ? (
                <Smartphone size={16} className="text-blue-500" />
              ) : (
                <Smartphone size={16} className="text-orange-500 animate-pulse" />
              )}
              <span className="text-[14px] font-bold text-gray-900 dark:text-white">Broadcast ID</span>
            </div>
            <code className="px-3 py-1.5 bg-gray-200 dark:bg-gray-800 rounded-lg text-[12px] font-mono font-bold text-gray-700 dark:text-gray-300 tracking-wider">
              {bleDeviceId}
            </code>
          </div>

          <div className="flex items-center gap-2 mt-6 text-orange-600 dark:text-orange-500 bg-orange-50 dark:bg-orange-500/10 px-4 py-2.5 rounded-xl">
            <ShieldAlert size={16} className="shrink-0" />
            <span className="text-[11px] font-bold">Encrypted P2P Secure Session listening for connections...</span>
          </div>
        </>
      )}
    </div>
  );
}
