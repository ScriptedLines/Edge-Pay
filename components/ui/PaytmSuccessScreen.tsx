"use client";

import { motion } from "framer-motion";
import { ArrowLeft, MoreVertical, Copy, Home, ScanLine, Gift } from "lucide-react";
import { useEffect, useState } from "react";

interface PaytmSuccessScreenProps {
  amount: number;
  target: string;
  upiId?: string;
  onClose: () => void;
  onPayAgain?: () => void;
}

function generateRef(): string {
  return Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const day = d.getDate();
  const month = d.toLocaleString("en-IN", { month: "short" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${day} ${month}, ${time.toUpperCase()}`;
}

export default function PaytmSuccessScreen({
  amount,
  target,
  upiId,
  onClose,
  onPayAgain,
}: PaytmSuccessScreenProps) {
  const [refNo] = useState(generateRef());
  const [ts] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(refNo).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Prevent body scroll while this overlay is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="fixed inset-0 z-[200] flex flex-col w-full max-w-[440px] mx-auto"
      style={{ background: "linear-gradient(180deg, #cceeff 0%, #e8f7fd 40%, #f4fbff 70%, #ffffff 100%)" }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-10 pb-4">
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-black/10 transition-colors"
        >
          <ArrowLeft size={22} className="text-gray-700" />
        </button>

        {/* Paytm Logo */}
        <div className="flex items-center gap-0.5">
          <span className="font-black text-[22px] tracking-tight text-[#00B9F1]">pay</span>
          <span className="font-black text-[22px] tracking-tight text-[#002970]">tm</span>
          <span className="text-red-500 text-[11px] ml-0.5">♥</span>
        </div>

        <button className="w-9 h-9 flex items-center justify-center rounded-full active:bg-black/10 transition-colors">
          <MoreVertical size={22} className="text-gray-700" />
        </button>
      </div>

      {/* ── Payee Info ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center pt-3 pb-4 px-6">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-[22px] font-extrabold text-gray-900 mb-1"
        >
          {target}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-[13px] text-gray-500 font-medium"
        >
          UPI ID: {upiId || `${target.toLowerCase().replace(/\s+/g, "")}@paytm`}
        </motion.p>
      </div>

      {/* ── Amount Badge ────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-4 py-4">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.2 }}
          className="flex items-center gap-3"
        >
          <span className="text-[52px] font-black text-gray-900 leading-none">
            ₹{amount.toLocaleString("en-IN")}
          </span>

          {/* Green verified checkmark badge — matches Paytm polygon style */}
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.35 }}
            className="relative flex items-center justify-center"
          >
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              {/* Polygon background — Paytm uses a rounded star/badge shape */}
              <path
                d="M22 3L27.5 9.5H36L34 18L41 22L34 26L36 34.5H27.5L22 41L16.5 34.5H8L10 26L3 22L10 18L8 9.5H16.5L22 3Z"
                fill="#22c55e"
              />
              {/* Checkmark */}
              <path
                d="M14 22L19.5 27.5L30 17"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
        </motion.div>
      </div>

      {/* ── Date & Ref ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center justify-center gap-2 pb-6 text-[13px] text-gray-500 font-medium"
      >
        <span>{formatDate(ts)}</span>
        <span className="text-gray-300">•</span>
        <span>Ref. No: {refNo}</span>
        <button
          onClick={handleCopy}
          className="ml-1 active:scale-90 transition-transform"
          title="Copy reference"
        >
          <Copy size={14} className={copied ? "text-green-500" : "text-gray-400"} />
        </button>
      </motion.div>

      {/* ── Action Buttons ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="flex items-center justify-center gap-3 px-6 pb-5"
      >
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-full border border-gray-300 bg-white text-[14px] font-bold text-gray-800 active:scale-95 transition-all shadow-sm"
        >
          Check Balance
        </button>
        <button
          onClick={onPayAgain || onClose}
          className="flex-1 py-3 rounded-full border border-gray-300 bg-white text-[14px] font-bold text-gray-800 active:scale-95 transition-all shadow-sm"
        >
          Pay Again
        </button>
        <button className="flex items-center gap-1.5 px-5 py-3 rounded-full bg-[#25D366] text-white text-[14px] font-bold active:scale-95 transition-all shadow-md shadow-green-200">
          {/* WhatsApp icon */}
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <path
              d="M8.5 0C3.806 0 0 3.806 0 8.5c0 1.497.392 2.903 1.074 4.12L0 17l4.515-1.052A8.454 8.454 0 0 0 8.5 17C13.194 17 17 13.194 17 8.5S13.194 0 8.5 0zm4.22 11.977c-.179.503-1.042.962-1.448.994-.407.032-.793.193-2.669-.556-2.246-.897-3.663-3.194-3.773-3.34-.11-.147-.9-1.197-.9-2.283 0-1.086.57-1.62.773-1.84.202-.22.44-.275.586-.275h.422c.14 0 .327-.052.511.39.186.44.63 1.52.686 1.63.055.11.092.238.018.385-.073.147-.11.239-.22.367-.11.128-.231.287-.33.385-.11.11-.224.23-.097.45.128.22.568.938 1.221 1.52.839.75 1.547 1.083 1.766 1.2.22.11.348.092.476-.055.128-.147.55-.64.697-.86.146-.22.293-.183.495-.11.202.073 1.28.604 1.5.714.22.11.366.165.42.257.054.092.054.532-.124 1.036z"
              fill="white"
            />
          </svg>
          Share
        </button>
      </motion.div>

      {/* ── Scratchcard Banner ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="mx-0 overflow-hidden"
      >
        {/* Purple ticker */}
        <div className="bg-[#6B21A8] w-full py-2 flex items-center overflow-hidden">
          <div className="flex items-center gap-3 animate-[marquee_8s_linear_infinite] whitespace-nowrap text-white text-[12px] font-bold tracking-widest uppercase px-4">
            <Gift size={14} />
            <span>YOU JUST WON A SCRATCHCARD</span>
            <span className="mx-3">•</span>
            <Gift size={14} />
            <span>YOU JUST WON A SCRATCHCARD</span>
            <span className="mx-3">•</span>
            <Gift size={14} />
            <span>YOU JUST WON A SCRATCHCARD</span>
          </div>
        </div>

        {/* Promo Card */}
        <div
          className="relative w-full px-5 pt-6 pb-8 flex flex-col items-center"
          style={{ background: "linear-gradient(135deg, #fff3e8 0%, #fef8f0 100%)" }}
        >
          {/* SCRATCH NOW Button */}
          <div className="absolute left-4 top-4">
            <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform">
              <span className="text-white text-[9px] font-black uppercase tracking-wider leading-tight text-center px-1">SCRATCH NOW</span>
            </div>
          </div>

          {/* Brand name */}
          <div className="bg-white rounded-xl px-7 py-2 shadow-sm border border-gray-100 mb-3 mt-2">
            <span className="text-[22px] font-black tracking-tight text-gray-800">AJIO</span>
          </div>

          <p className="text-[18px] font-extrabold text-orange-500 text-center leading-tight mb-1">
            Flat 20% Off on Clothing &amp; more
          </p>
          <p className="text-[12px] text-gray-500 font-medium mb-4">*No Minimum Order Value ₹999</p>

          <button className="bg-orange-500 text-white font-bold text-[14px] px-8 py-3 rounded-full shadow-md active:scale-95 transition-transform">
            Redeem Now
          </button>
        </div>
      </motion.div>

      {/* ── Bottom Nav ──────────────────────────────────────────── */}
      <div className="mt-auto border-t border-gray-100 bg-white py-3">
        <div className="flex items-center justify-around">
          <button
            onClick={onClose}
            className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
          >
            <div className="w-9 h-9 bg-[#002970] rounded-xl flex items-center justify-center">
              <Home size={18} className="text-white" />
            </div>
            <span className="text-[11px] font-bold text-[#002970]">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1 active:scale-95 transition-transform">
            <div className="w-9 h-9 bg-[#002970] rounded-xl flex items-center justify-center">
              <ScanLine size={18} className="text-white" />
            </div>
            <span className="text-[11px] font-bold text-[#002970]">Scan</span>
          </button>
          <button className="flex flex-col items-center gap-1 active:scale-95 transition-transform">
            <div className="w-9 h-9 bg-[#002970] rounded-xl flex items-center justify-center">
              <Gift size={18} className="text-white" />
            </div>
            <span className="text-[11px] font-bold text-[#002970]">CashBack</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
