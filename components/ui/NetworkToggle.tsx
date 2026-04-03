"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff } from "lucide-react";

interface NetworkStatusProps {
  onStatusChange: (isOnline: boolean) => void;
}

/**
 * Reads REAL network connectivity from the browser/device.
 * - Listens to window "online" / "offline" events (fires instantly on Android when WiFi toggles).
 * - Also polls navigator.onLine as a fallback every 5 seconds.
 * - Calls onStatusChange whenever the state flips so the parent can react.
 * - Renders as a non-interactive status badge (no toggle — it mirrors reality).
 */
export default function NetworkStatus({ onStatusChange }: NetworkStatusProps) {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const update = (online: boolean) => {
      setIsOnline(online);
      onStatusChange(online);
    };

    const handleOnline  = () => update(true);
    const handleOffline = () => update(false);

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    // Poll as a safety net (navigator.onLine can lag on some Android WebViews)
    const poll = setInterval(() => {
      const current = navigator.onLine;
      setIsOnline(prev => {
        if (prev !== current) {
          onStatusChange(current);
          return current;
        }
        return prev;
      });
    }, 5000);

    // Sync initial state at mount
    update(navigator.onLine);

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(poll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full select-none"
      style={{
        background:  isOnline ? "#F0FDF4" : "#FEF2F2",
        color:       isOnline ? "#16a34a" : "#dc2626",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isOnline ? "online" : "offline"}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
          className="flex items-center"
        >
          {isOnline ? <Wifi size={15} /> : <WifiOff size={15} className="animate-pulse" />}
        </motion.span>
      </AnimatePresence>
      <span className="text-[11px] font-bold whitespace-nowrap">
        {isOnline ? "Online" : "Offline"}
      </span>
    </div>
  );
}
