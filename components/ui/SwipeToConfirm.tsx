"use client";

import { useState, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ChevronRight, CheckCircle2 } from "lucide-react";

interface SwipeToConfirmProps {
  label?: string;
  onConfirm?: () => void;
}

const TRACK_PADDING = 6;
const KNOB_SIZE = 52;

export default function SwipeToConfirm({
  label = "Swipe to Pay",
  onConfirm,
}: SwipeToConfirmProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  const maxX = Math.max(0, trackWidth - KNOB_SIZE - TRACK_PADDING * 2);

  const trackBg = useTransform(
    x,
    [0, maxX],
    ["#002970", "#16a34a"]
  );

  const labelOpacity = useTransform(x, [0, maxX * 0.4], [1, 0]);

  const handleMeasure = (el: HTMLDivElement | null) => {
    if (el) {
      trackRef.current = el;
      setTrackWidth(el.offsetWidth);
    }
  };

  const handleDragEnd = () => {
    const currentX = x.get();
    if (currentX > maxX * 0.75) {
      // Snap to end → confirmed
      animate(x, maxX, { type: "spring", stiffness: 400, damping: 30 });
      setConfirmed(true);
      setTimeout(() => onConfirm?.(), 400);
    } else {
      // Snap back with physics
      animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
    }
  };

  return (
    <div className="w-full px-1 pb-2">
      <motion.div
        ref={handleMeasure}
        className="relative h-16 rounded-2xl overflow-hidden select-none"
        style={{ background: trackBg }}
      >
        {/* Track label */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: labelOpacity }}
        >
          <span className="text-white/80 text-[14px] font-semibold tracking-wide">
            {label}
          </span>
        </motion.div>

        {/* Confirmed overlay */}
        {confirmed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={20} color="white" />
            <span className="text-white text-[15px] font-bold">Confirmed!</span>
          </motion.div>
        )}

        {/* Draggable knob */}
        {!confirmed && (
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: maxX }}
            dragElastic={0.05}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            style={{
              x,
              position: "absolute",
              top: TRACK_PADDING,
              left: TRACK_PADDING,
              width: KNOB_SIZE,
              height: KNOB_SIZE,
              borderRadius: 16,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              cursor: "grab",
              zIndex: 10,
            }}
            whileTap={{ cursor: "grabbing", scale: 0.96 }}
          >
            <ChevronRight size={22} color="#002970" strokeWidth={2.5} />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
