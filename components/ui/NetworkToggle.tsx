"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff } from "lucide-react";

interface NetworkToggleProps {
  isOnline: boolean;
  onToggle: (state: boolean) => void;
}

export default function NetworkToggle({
  isOnline,
  onToggle,
}: NetworkToggleProps) {
  return (
    <motion.button
      onClick={() => onToggle(!isOnline)}
      whileTap={{ scale: 0.85 }}
      whileHover={{ scale: 1.08 }}
      className="w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-200 relative overflow-hidden"
      style={{
        background: isOnline ? "#F0Fdf4" : "#Fef2f2",
        color: isOnline ? "#16a34a" : "#dc2626",
      }}
      aria-label="Toggle Network"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isOnline ? "online" : "offline"}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
        >
          {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
