"use client";

import { motion } from "framer-motion";
import {
  Wifi,
  Smartphone,
  Zap,
  ShoppingCart,
  Users,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  wifi: Wifi,
  smartphone: Smartphone,
  zap: Zap,
  cart: ShoppingCart,
  users: Users,
  card: CreditCard,
};

interface ActionReceiptCardProps {
  title: string;
  subtitle?: string;
  upiId?: string;
  amount: string;
  iconName?: keyof typeof iconMap;
  index?: number;
  isEdgePay?: boolean;
  availableLimit?: number;
}

export default function ActionReceiptCard({
  title,
  subtitle,
  upiId,
  amount,
  iconName = "card",
  index = 0,
  isEdgePay = false,
  availableLimit = 0,
}: ActionReceiptCardProps) {
  const Icon = iconMap[iconName] ?? CreditCard;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}
      className="flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-colors duration-200"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Icon badge */}
      <div
        className="w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center bg-[#EEF4FF] dark:bg-blue-900/30 transition-colors"
      >
        <Icon size={20} className="text-[#002970] dark:text-[#00B9F1]" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] font-semibold leading-tight truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </p>
        {subtitle && (
          <p
            className="text-[14px] mt-0.5 font-bold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {subtitle}
          </p>
        )}
        <p
          className="text-[11px] mt-0.5 truncate"
          style={{ color: "var(--text-secondary)" }}
        >
          UPI: {upiId || "merchant@ptsbi"}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <span
          className="text-[15px] font-extrabold text-[#002970] dark:text-white"
        >
          {amount}
        </span>
        {isEdgePay && (
          <div className="mt-1">
             <p className="text-[10px] text-[#00B9F1] font-bold">AI Limit: ₹{availableLimit.toLocaleString()}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
