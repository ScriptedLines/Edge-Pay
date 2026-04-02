"use client";

import { useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { X } from "lucide-react";

interface BottomSheetContainerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export default function BottomSheetContainer({
  isOpen,
  onClose,
  children,
  title = "Action Plan",
}: BottomSheetContainerProps) {
  // Lock scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 36,
              mass: 0.9,
            }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] z-50 rounded-t-3xl pb-safe bg-white dark:bg-[#1A1A1A] shadow-[0_-8px_30px_rgb(0,0,0,0.12)] dark:shadow-none"
            style={{
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-800"
              />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800/50"
            >
              <div>
                <h2
                  className="text-[17px] font-bold text-gray-900 dark:text-white"
                >
                  {title}
                </h2>
              </div>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                aria-label="Close"
              >
                <X size={20} />
              </motion.button>
            </div>

            {/* Scrollable content */}
            <div
              className="flex-1 overflow-y-auto px-4 pt-4 pb-4 flex flex-col gap-3"
              style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
