"use client";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight } from "lucide-react";

interface InvalidPromptCardProps {
    errorMessage: string;
    originalPrompt: string;
    onClose: () => void;
}

const SUGGESTIONS = [
    "Pay 500 to Rahul",
    "Split 300 wifi bill between 3",
    "Transfer 1000 to HDFC bank",
    "Show my balance",
    "Switch to dark mode",
];

export default function InvalidPromptCard({ errorMessage, originalPrompt, onClose }: InvalidPromptCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end"
        >
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="w-full max-w-[440px] mx-auto bg-white dark:bg-[#111111] rounded-t-3xl p-5 shadow-2xl"
            >
                {/* Error Header */}
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0">
                        <AlertCircle size={22} className="text-orange-500" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-[15px] font-black text-gray-900 dark:text-white leading-tight">
                            I didn't understand that
                        </h3>
                        <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 italic">
                            "{originalPrompt}"
                        </p>
                    </div>
                </div>

                {/* Reason */}
                <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-xl mb-4">
                    <p className="text-[13px] text-orange-700 dark:text-orange-400 font-medium leading-relaxed">
                        {errorMessage || "I'm your Paytm assistant. I can help with payments, money transfers, balance checks, and app navigation — but not with this request."}
                    </p>
                </div>

                {/* What you CAN do */}
                <div className="mb-4">
                    <p className="text-[12px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                        Try saying...
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {SUGGESTIONS.map((s) => (
                            <div key={s} className="flex items-center gap-2 px-3 py-2 bg-[#F5F7F8] dark:bg-[#1A1A1A] rounded-xl">
                                <ArrowRight size={12} className="text-[#00B9F1] flex-shrink-0" />
                                <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300">"{s}"</span>
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-4 bg-[#002970] text-white text-[15px] font-black rounded-2xl active:scale-95 transition-transform"
                >
                    Got it, I'll try again
                </button>
            </motion.div>
        </motion.div>
    );
}
