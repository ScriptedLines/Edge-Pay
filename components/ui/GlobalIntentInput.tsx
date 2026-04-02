"use client";

import { useRef, useState } from "react";
import { Mic, Send, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface GlobalIntentInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholderOverride?: string;
}

export default function GlobalIntentInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  disabled = false,
  placeholderOverride,
}: GlobalIntentInputProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!value.trim() || isLoading || disabled) return;
    onSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-3"
      style={{
        background:
          "linear-gradient(to top, var(--bg-primary) 70%, transparent)",
      }}
    >
      <motion.div
        animate={{
          boxShadow: focused
            ? "0 0 0 2px #00B9F1, 0 8px 32px rgba(0,185,241,0.18)"
            : "0 4px 24px rgba(0,0,0,0.1)",
        }}
        transition={{ duration: 0.25 }}
        className="relative flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors duration-200"
        style={{
          background: "var(--bg-secondary)",
          border: "1.5px solid var(--border)",
        }}
      >
        {/* Mic button */}
        <motion.button
          whileTap={{ scale: 0.85 }}
          whileHover={{ scale: 1.1 }}
          className="flex-shrink-0 p-1.5 rounded-full transition-colors"
          style={{ color: "#00B9F1" }}
          aria-label="Voice input"
        >
          <Mic size={20} />
        </motion.button>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled || isLoading}
          placeholder={placeholderOverride || "What do you want to do?"}
          className="flex-1 bg-transparent outline-none text-[15px] font-medium placeholder:font-normal"
          style={{
            color: "var(--text-primary)",
          }}
        />

        {/* Send button */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          whileHover={{ scale: 1.1 }}
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading || disabled}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200"
          style={{
            background: value.trim() ? "#002970" : "var(--border)",
            color: value.trim() ? "#FFFFFF" : "var(--text-secondary)",
          }}
          aria-label="Send"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </motion.button>
      </motion.div>

      {/* Hint text */}
      <p
        className="text-center text-xs mt-2"
        style={{ color: "var(--text-secondary)" }}
      >
        Try: "Split ₹1200 with Rahul and pay Airtel bill"
      </p>
    </div>
  );
}
