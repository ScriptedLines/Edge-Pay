"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Scan, AlertCircle, Maximize, Bluetooth } from "lucide-react";
import { Capacitor } from "@capacitor/core";
// import { BarcodeScanner } from '@capacitor/barcode-scanner'; // Will implement in NativeP2PService

interface OfflineScannerSimProps {
  onScan: (upi: string, bleId: string) => void;
  onCancel: () => void;
}

export default function OfflineScannerSim({ onScan, onCancel }: OfflineScannerSimProps) {
  const [pastePayload, setPastePayload] = useState("");
  const [isScanningNative, setIsScanningNative] = useState(false);

  useEffect(() => {
    // If native, we would trigger BarcodeScanner.startScan() here
    // For now we keep the mock UI which also allows pasting for simulator
    if (Capacitor.isNativePlatform()) {
      setIsScanningNative(true);
    }
  }, []);

  const handleManualSubmit = () => {
    try {
      if (pastePayload.startsWith("edgepay://p2p")) {
        const url = new URL(pastePayload);
        const upi = url.searchParams.get("upi");
        const ble = url.searchParams.get("ble");
        if (upi && ble) {
          onScan(upi, ble);
          return;
        }
      }
      alert("Invalid EdgePay QR Payload");
    } catch (e) {
      alert("Invalid QR format");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center h-[70vh]">
      <motion.div 
        animate={{ scale: [1, 1.05, 1] }} 
        transition={{ repeat: Infinity, duration: 2 }}
        className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center relative mb-6 border border-blue-200 dark:border-blue-800"
      >
        <Maximize size={40} className="text-[#00B9F1] absolute stroke-1" />
        <Scan size={30} className="text-blue-500" />
      </motion.div>

      <h2 className="text-[22px] font-black text-gray-900 dark:text-white mb-2">Scan QR to Pay</h2>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-[280px] leading-relaxed mb-6">
        {isScanningNative ? "Native Camera Scanner active in background..." : "Browser Simulator: To 'scan', copy the payload URL from the receiver's tab and paste it here."}
      </p>

      {!isScanningNative && (
        <div className="w-full mb-8">
          <input 
            type="text" 
            value={pastePayload}
            onChange={(e) => setPastePayload(e.target.value)}
            className="w-full h-12 px-4 rounded-xl text-[14px] font-mono outline-none border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] bg-[#F5F7F8] dark:bg-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400"
            placeholder="edgepay://p2p?..."
          />
          <button 
            onClick={handleManualSubmit}
            className="w-full mt-3 py-3 bg-[#00B9F1] text-white font-bold rounded-xl active:scale-95 transition-transform"
          >
            Simulate Scan Success
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 rounded-xl border border-blue-100 dark:border-blue-800/50">
        <Bluetooth size={16} className="animate-pulse" />
        <span className="text-[11px] font-bold">Encrypted BLE Handshake Ready</span>
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
