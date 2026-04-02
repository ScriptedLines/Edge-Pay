"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Clock, Wifi, BadgeCheck } from "lucide-react";

interface ReceiverReceiptSlipProps {
  amount: number;
  target: string;
  tokenId: string;
  timestamp: number;
}

export default function ReceiverReceiptSlip({ amount, target, tokenId, timestamp }: ReceiverReceiptSlipProps) {
  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = new Date(timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.2 }}
      className="mx-1 mt-4 rounded-[24px] overflow-hidden border border-green-600/20 dark:border-green-900/50 bg-[#f8fff8] dark:bg-gradient-to-br dark:from-[#0a1a0a] dark:to-[#0d1f0d] shadow-lg transition-colors"
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 border-b border-green-600/10 dark:border-green-900/30 bg-green-500/5 dark:bg-green-500/10">
        <div className="w-10 h-10 bg-green-600 dark:bg-green-500 rounded-full flex items-center justify-center shadow-md dark:shadow-[0_0_20px_rgba(34,197,94,0.4)]">
          <BadgeCheck size={22} className="text-white" />
        </div>
        <div>
          <p className="text-[13px] font-black text-green-700 dark:text-green-400 uppercase tracking-widest">Paytm Edge-Pay Receipt</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Guaranteed by Paytm Guarantor</p>
        </div>
      </div>

      {/* Amount */}
      <div className="px-5 pt-5 pb-4 flex justify-between items-start border-b border-dashed border-green-600/10 dark:border-green-900/30">
        <div>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Amount</p>
          <p className="text-[32px] font-black text-gray-900 dark:text-white">₹{amount.toLocaleString("en-IN")}</p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">To</p>
          <p className="text-[16px] font-bold text-gray-900 dark:text-white">{target}</p>
        </div>
      </div>

      {/* Promise Banner */}
      <div className="mx-4 my-4 px-4 py-3 rounded-xl flex items-center gap-3 bg-[#00B9F1]/5 dark:bg-[#00B9F1]/10 border border-[#00B9F1]/20">
        <Clock size={18} className="text-[#00B9F1] shrink-0" />
        <p className="text-[12px] text-gray-700 dark:text-gray-300 leading-snug">
          <span className="font-bold text-gray-900 dark:text-white">Funds guaranteed.</span> Will auto-settle to merchant account
          within seconds of sender reconnecting to internet.
        </p>
      </div>

      {/* Bottom Meta */}
      <div className="px-5 pb-5 flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wider mb-0.5">Bundle ID (Nonce)</p>
            <p className="text-[11px] font-mono font-bold text-gray-500 dark:text-gray-400">{tokenId}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wider mb-0.5">Timestamp</p>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{timeStr} · {dateStr}</p>
          </div>
        </div>
        
        {typeof window !== 'undefined' && (window as any).__lastSignature && (
           <div className="bg-gray-100 dark:bg-[#0A0A0A] p-2 rounded-lg border border-gray-200 dark:border-gray-800">
             <p className="text-[9px] text-gray-500 dark:text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
               <ShieldCheck size={10} className="text-[#00B9F1]" /> Digital Signature (Verified)
             </p>
             <p className="text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500 break-all leading-tight">
               {(window as any).__lastSignature}
             </p>
           </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-green-600/10 dark:border-green-900/30 flex items-center justify-center gap-2 bg-green-500/5 dark:bg-green-500/5">
        <ShieldCheck size={14} className="text-green-600 dark:text-green-500" />
        <p className="text-[11px] text-green-700 dark:text-green-600 font-bold uppercase tracking-wider">Anti-Forgery Shield Active</p>
        <Wifi size={12} className="text-green-600 dark:text-green-500 animate-pulse" />
      </div>
    </motion.div>
  );
}
