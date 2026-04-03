"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import {
  Bluetooth,
  Volume2,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Zap,
} from "lucide-react";
import { transmitPayment, BlePhase } from "@/lib/ble/EdgePayBleService";
import { transmitP2PPayload } from "@/lib/ble/NativeP2PService";

interface BleSoundboxProps {
  amount: number;
  target: string;
  merchantId?: string;
  // For browser simulator: receiver listens on localStorage key `ble_payload_<bleId>`
  targetBleId?: string;
  senderUpiId?: string;
  tokenId?: string;
  onComplete?: (success: boolean, tokenId?: string) => void;
}

const PHASE_LABELS: Record<BlePhase, string> = {
  idle:         "Ready to Connect",
  scanning:     "Opening BLE Scanner...",
  connecting:   "Connecting to Soundbox...",
  transmitting: "Transmitting Secure Bundle...",
  success:      "Payment Transmitted!",
  error:        "Transmission Failed",
};

const PHASE_SUBLABELS: Record<BlePhase, string> = {
  idle:         "Tap the button to connect to the nearby soundbox device.",
  scanning:     "Select the Edge-Pay Soundbox from your browser's device list.",
  connecting:   "Establishing encrypted GATT connection...",
  transmitting: "Pushing HMAC-signed payment bundle via BLE radio...",
  success:      "Voice alert triggered on soundbox. Merchant guarantee secured.",
  error:        "Could not reach the soundbox. Payment will sync when online.",
};

export default function BleSoundbox({
  amount,
  target,
  merchantId,
  targetBleId,
  senderUpiId,
  tokenId,
  onComplete,
}: BleSoundboxProps) {
  const [phase, setPhase] = useState<BlePhase>("idle");
  const [detail, setDetail] = useState("");
  const [deviceName, setDeviceName] = useState<string>("");
  const [hasTriggeredTts, setHasTriggeredTts] = useState(false);

  const handlePhase = useCallback((p: BlePhase, d?: string) => {
    setPhase(p);
    if (d) setDetail(d);
  }, []);

  const startBleTransmission = useCallback(async () => {
    // Browser simulator path: push payload into localStorage for receiver screen.
    if (!Capacitor.isNativePlatform() && targetBleId && senderUpiId) {
      const res = await transmitP2PPayload(
        targetBleId,
        {
          amount,
          sender: senderUpiId,
          tokenId,
          ts: Date.now(),
        },
        (p) => {
          if (p === "connecting") handlePhase("connecting", "Connecting to Soundbox (simulated)...");
          if (p === "transmitting") handlePhase("transmitting", "Transmitting Secure Bundle (simulated)...");
          if (p === "success") handlePhase("success", "Payment Transmitted! (simulated)");
          if (p === "error") handlePhase("error", "Transmission Failed (simulated)");
        }
      );

      if (res.success) {
        if (!hasTriggeredTts && "speechSynthesis" in window) {
          setHasTriggeredTts(true);
          const utterance = new SpeechSynthesisUtterance(
            `Payment of ${amount} rupees to ${target} sent via Edge Pay`
          );
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        }
        setTimeout(() => onComplete?.(true, tokenId), 700);
      } else {
        setTimeout(() => onComplete?.(false), 1000);
      }
      return;
    }

    const merchant = merchantId || target;
    const result = await transmitPayment(amount, merchant, handlePhase);

    if (result.success) {
      setDeviceName(result.deviceName || "Soundbox");
      // Trigger local TTS as a confirmation echo on the payer's device too
      if (!hasTriggeredTts && "speechSynthesis" in window) {
        setHasTriggeredTts(true);
        const utterance = new SpeechSynthesisUtterance(
          `Payment of ${amount} rupees to ${target} sent via Edge Pay`
        );
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }

      // Notify parent after a short animation delay
      setTimeout(() => onComplete?.(true, result.tokenId), 1500);
    } else {
      // On error/cancel: fall back gracefully — treat as success (offline record still kept)
      if (result.error !== "Cancelled") {
        setTimeout(() => onComplete?.(false), 3000);
      } else {
        // User cancelled device picker — go back to idle
        setPhase("idle");
      }
    }
  }, [
    amount,
    target,
    merchantId,
    targetBleId,
    senderUpiId,
    tokenId,
    handlePhase,
    hasTriggeredTts,
    onComplete,
  ]);

  // On mount, immediately start BLE (triggers the browser device picker)
  useEffect(() => {
    const timer = setTimeout(() => {
      startBleTransmission();
    }, 600); // Brief delay for animation to settle
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive = phase === "scanning" || phase === "connecting" || phase === "transmitting";
  const isSuccess = phase === "success";
  const isError = phase === "error";
  const isIdle = phase === "idle";

  return (
    <div className="flex flex-col items-center justify-center py-6 px-4 bg-[#F5F7F8] dark:bg-[#111] rounded-[24px] border border-gray-200 dark:border-gray-800 shadow-xl relative overflow-hidden transition-colors">

      {/* Background Pulse FX — only when actively transmitting */}
      {isActive && (
        <>
          <motion.div
            animate={{ scale: [1, 2.5], opacity: [0.3, 0] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
            className="absolute w-24 h-24 bg-blue-500 rounded-full blur-xl z-0"
          />
          <motion.div
            animate={{ scale: [1, 3.5], opacity: [0.15, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
            className="absolute w-32 h-32 bg-blue-500 rounded-full blur-2xl z-0"
          />
        </>
      )}

      {/* Success glow */}
      {isSuccess && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 bg-green-500/5 rounded-[24px] z-0"
        />
      )}

      {/* Main Icon Area */}
      <div className="relative z-10 flex items-center justify-center mb-6 mt-4">
        <AnimatePresence mode="wait">
          {isSuccess ? (
            <motion.div
              key="success"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.4)]"
            >
              <CheckCircle2 size={50} className="text-white" />
            </motion.div>
          ) : isError ? (
            <motion.div
              key="error"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-24 h-24 bg-orange-500/10 border-2 border-orange-400 rounded-full flex items-center justify-center"
            >
              <AlertCircle size={40} className="text-orange-400" />
            </motion.div>
          ) : (
            // Connected device pair visualization
            <motion.div
              key="devices"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-6"
            >
              {/* Payer phone */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-white dark:bg-[#222] border-[2px] border-[#00B9F1] rounded-full flex items-center justify-center shadow-lg dark:shadow-[0_0_20px_rgba(0,185,241,0.3)]">
                  <Bluetooth size={28} className="text-[#00B9F1] animate-pulse" />
                </div>
                <span className="text-[10px] text-gray-400 font-extrabold mt-2 uppercase tracking-wider">Your Phone</span>
              </div>

              {/* Signal dots */}
              <div className="flex gap-1 opacity-80">
                {[0, 0.2, 0.4].map((delay, i) => (
                  <motion.div
                    key={i}
                    animate={isActive ? { opacity: [0.2, 1, 0.2], scale: [1, 1.3, 1] } : { opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay }}
                    className="w-2 h-2 bg-[#00B9F1] rounded-full"
                  />
                ))}
              </div>

              {/* Soundbox receiver */}
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-white dark:bg-[#222] border-[2px] border-gray-200 dark:border-gray-600 rounded-2xl flex items-center justify-center relative shadow-lg overflow-hidden">
                  {isActive ? (
                    <Loader2 size={26} className="text-[#00B9F1] animate-spin" />
                  ) : isIdle ? (
                    <Volume2 size={26} className="text-gray-400 dark:text-gray-300" />
                  ) : (
                    <Zap size={26} className="text-orange-400" />
                  )}
                  {isIdle && (
                    <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
                <span className="text-[10px] text-gray-400 font-extrabold mt-2 uppercase tracking-wider">
                  {deviceName || "Soundbox"}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status Text */}
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          className="text-center z-10 flex flex-col items-center min-h-[80px]"
        >
          <h3 className={`text-[18px] font-extrabold mb-1.5 tracking-tight ${
            isSuccess ? "text-green-600 dark:text-green-400" :
            isError   ? "text-orange-500" :
            "text-gray-900 dark:text-white"
          }`}>
            {PHASE_LABELS[phase]}
          </h3>
          <p className="text-[13px] text-gray-400 font-medium max-w-[280px] leading-snug text-center">
            {detail || PHASE_SUBLABELS[phase]}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* CTA — show connect button if BLE picker was dismissed */}
      {isIdle && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={startBleTransmission}
          className="mt-4 z-10 flex items-center gap-2 bg-[#00B9F1] text-white rounded-full py-2.5 px-6 font-bold text-[14px] shadow-lg active:scale-95 transition-transform"
        >
          <Bluetooth size={16} />
          Connect to Soundbox
        </motion.button>
      )}

      {/* Success badge */}
      {isSuccess && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-4 z-10 flex items-center justify-center gap-2 bg-white dark:bg-[#222] rounded-full py-2 px-4 border border-green-100 dark:border-green-900 shadow-sm"
        >
          <ShieldCheck size={16} className="text-green-500" />
          <span className="text-[12px] font-bold text-gray-500 dark:text-gray-300">
            HMAC Verified · Voice Alert Triggered
          </span>
        </motion.div>
      )}

      {/* Error fallback badge */}
      {isError && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 z-10 flex items-center justify-center gap-2 bg-orange-50 dark:bg-orange-900/20 rounded-full py-2 px-4 border border-orange-200 dark:border-orange-800"
        >
          <ShieldCheck size={16} className="text-orange-500" />
          <span className="text-[12px] font-bold text-orange-600 dark:text-orange-400">
            Transaction recorded offline — will settle on sync
          </span>
        </motion.div>
      )}
    </div>
  );
}
