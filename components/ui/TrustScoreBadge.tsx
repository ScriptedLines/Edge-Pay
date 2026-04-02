"use client";

import { motion } from "framer-motion";
import { ShieldCheck, AlertOctagon, Zap, TrendingDown } from "lucide-react";

interface TrustScoreBadgeProps {
  isBlocked?: boolean;
  edgeScore?: number;
  edgeLimit?: number;
  balanceDrain?: number;
  trustTier?: string;
  trustColor?: string;
  gruRisk?: number;        // 0–100
  elapsedHours?: number;  // hours offline
  isColdStart?: boolean;
}

export default function TrustScoreBadge({
  isBlocked = false,
  edgeScore = 50,
  edgeLimit = 0,
  balanceDrain = 0,
  trustTier = "Moderate",
  trustColor = "#f59e0b",
  gruRisk = 0,
  elapsedHours = 0,
  isColdStart = false,
}: TrustScoreBadgeProps) {
  const isDraining = balanceDrain > 50;
  const isOffline  = elapsedHours > 0;

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Main badge */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
        style={{
          background: isBlocked
            ? "linear-gradient(90deg, #7f1d1d, #450a0a)"
            : "linear-gradient(90deg, #111827, #1f2937)",
          boxShadow: isBlocked
            ? "0 4px 12px rgba(127, 29, 29, 0.4)"
            : "0 4px 12px rgba(0,0,0,0.1)",
        }}
      >
        {isBlocked ? (
          <AlertOctagon size={14} color="#fca5a5" />
        ) : (
          <ShieldCheck size={14} color="#00B9F1" />
        )}
        <span className="text-[12px] font-semibold text-white">
          {isBlocked ? "Offline Dues Pending" : "Edge-Pay Protected"}
        </span>
      </motion.div>

      {/* AI Limit Info Card */}
      {!isBlocked && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full bg-[#F5F7F8] dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl p-3 flex flex-col gap-2"
        >
          {isColdStart ? (
            <div className="flex flex-col items-center gap-1.5 py-2">
              <span className="text-[14px] font-bold text-gray-800 dark:text-gray-200">Build History First</span>
              <span className="text-[11px] text-center text-gray-500 dark:text-gray-400">
                You need at least 10 online transactions to unlock offline AI limit.
              </span>
            </div>
          ) : (
            <>
              {/* Score + Limit row */}
              <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Zap size={13} style={{ color: trustColor }} />
              <span className="text-[12px] font-bold text-gray-700 dark:text-gray-300">AI Trust Score</span>
            </div>
            <span className="text-[14px] font-black" style={{ color: trustColor }}>
              {edgeScore}/100 · {trustTier}
            </span>
          </div>

          {/* Score bar */}
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${edgeScore}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: trustColor }}
            />
          </div>

          {/* Offline limit row */}
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
              EdgePay Offline Limit
            </span>
            <span className="text-[13px] font-extrabold text-[#00B9F1]">
              ₹{edgeLimit.toLocaleString("en-IN")}
            </span>
          </div>

          {/* GRU Sequence Risk row */}
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
              Sequence Risk (GRU)
            </span>
            <span className="text-[12px] font-bold" style={{
              color: gruRisk > 60 ? "#ef4444" : gruRisk > 30 ? "#f59e0b" : "#22c55e"
            }}>
              {gruRisk}% {gruRisk > 60 ? "⚠ High" : gruRisk > 30 ? "~ Medium" : "✓ Low"}
            </span>
          </div>

          {/* Offline elapsed row — only shown when offline */}
          {isOffline && (
            <div className="flex items-center justify-between mt-0.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl px-2.5 py-1.5">
              <span className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
                ⏱ Offline {elapsedHours < 1
                  ? `${Math.round(elapsedHours * 60)}m`
                  : `${elapsedHours.toFixed(1)}h`} — limit decaying
              </span>
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400">
                {Math.round(Math.max(20, 100 - elapsedHours * 8))}%
              </span>
            </div>
          )}

              {/* Balance drain warning */}
              {isDraining && (
                <div className="flex items-center gap-1.5 mt-0.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl px-2.5 py-1.5">
                  <TrendingDown size={12} className="text-orange-500 flex-shrink-0" />
                  <span className="text-[11px] text-orange-700 dark:text-orange-400 font-medium">
                    Balance drained {balanceDrain}% — limit reduced by AI
                  </span>
                </div>
              )}
            </>
          )}

        </motion.div>
      )}
    </div>
  );
}
