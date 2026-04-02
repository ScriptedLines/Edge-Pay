"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Check, Phone, X, Send, Sparkles, Lock } from "lucide-react";

// ── Mock Contacts Data ─────────────────────────────────────────────────────────
const MOCK_CONTACTS = [
    { id: "me", name: "You (Me)", upi: "me@paytm", initials: "ME", color: "#002970", isMe: true },
    { id: "c1", name: "Rahul Sharma", upi: "rahul@ptsbi", initials: "RS", color: "#6366F1" },
    { id: "c2", name: "Priya Mehta", upi: "priya@ybl", initials: "PM", color: "#EC4899" },
    { id: "c3", name: "Amit Kumar", upi: "amit@upi", initials: "AK", color: "#10B981" },
    { id: "c4", name: "Sneha Patel", upi: "sneha@ptsbi", initials: "SP", color: "#F59E0B" },
    { id: "c5", name: "Raj Verma", upi: "raj@okaxis", initials: "RV", color: "#3B82F6" },
    { id: "c6", name: "Deepika Singh", upi: "deepika@upi", initials: "DS", color: "#EF4444" },
    { id: "c7", name: "Arjun Nair", upi: "arjun@oksbi", initials: "AN", color: "#8B5CF6" },
    { id: "c8", name: "Kavya Reddy", upi: "kavya@ptsbi", initials: "KR", color: "#06B6D4" },
];

type Contact = typeof MOCK_CONTACTS[number];
type Step = "permission" | "picker" | "confirm" | "sent";

interface InteractiveSplitCardProps {
    title: string;
    totalAmount: number;
    targetCount?: number; // total people including user (from NLP)
    onClose: () => void;
    onConfirm: (contacts: Contact[], perPersonAmount: number) => void;
}

export default function InteractiveSplitCard({
    title,
    totalAmount,
    targetCount,
    onClose,
    onConfirm,
}: InteractiveSplitCardProps) {
    // "Me" is always pre-selected
    const [step, setStep] = useState<Step>("permission");
    const [selected, setSelected] = useState<Contact[]>([MOCK_CONTACTS[0]]); // Me always selected
    const [search, setSearch] = useState("");

    const maxSelectable = targetCount ?? 99;
    const atLimit = selected.length >= maxSelectable;

    const perPerson = selected.length > 0 ? Math.ceil(totalAmount / selected.length) : totalAmount;
    const myShare = perPerson; // Since "Me" is always included

    const filtered = MOCK_CONTACTS.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const isSelected = (id: string) => selected.some((c) => c.id === id);

    const toggleContact = (contact: Contact) => {
        if (contact.id === "me") return; // Me is always locked in
        if (isSelected(contact.id)) {
            setSelected((prev) => prev.filter((c) => c.id !== contact.id));
        } else {
            if (!atLimit) {
                setSelected((prev) => [...prev, contact]);
            }
        }
    };

    // ── Step: Contact Permission ──────────────────────────────────────────────
    if (step === "permission") {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="flex flex-col items-center gap-5 py-4 px-2"
            >
                <div className="w-16 h-16 rounded-2xl bg-[#E5F1FB] dark:bg-[#002970]/30 flex items-center justify-center">
                    <Phone size={28} className="text-[#002970] dark:text-[#00B9F1]" />
                </div>
                <div className="text-center">
                    <h3 className="text-[17px] font-black text-gray-900 dark:text-white mb-1">
                        Access Contacts?
                    </h3>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed max-w-[260px] mx-auto">
                        <span className="font-semibold text-[#002970] dark:text-[#00B9F1]">Paytm</span> wants to access
                        your contacts to split{" "}
                        <span className="font-bold text-gray-800 dark:text-white">"{title}"</span>{" "}
                        of <span className="font-black text-[#002970] dark:text-[#00B9F1]">₹{totalAmount.toLocaleString("en-IN")}</span>
                        {targetCount && (
                            <span> between <span className="font-black">{targetCount} people</span></span>
                        )}.
                    </p>
                </div>
                <div className="w-full flex flex-col gap-2 mt-2">
                    <button
                        onClick={() => setStep("picker")}
                        className="w-full py-4 bg-[#002970] text-white text-[15px] font-black rounded-2xl shadow-lg shadow-[#002970]/20 transition-transform active:scale-95"
                    >
                        Allow Access
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 bg-gray-100 dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400 text-[15px] font-bold rounded-2xl transition-transform active:scale-95"
                    >
                        Don&apos;t Allow
                    </button>
                </div>
            </motion.div>
        );
    }

    // ── Step: Contact Picker ──────────────────────────────────────────────────
    if (step === "picker") {
        return (
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col gap-3 py-2"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-1">
                    <div>
                        <h3 className="text-[15px] font-black text-gray-900 dark:text-white">
                            Split: <span className="text-[#002970] dark:text-[#00B9F1]">"{title}"</span>
                        </h3>
                        <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                            ₹{totalAmount.toLocaleString("en-IN")} total
                            {targetCount && ` · Select ${targetCount - 1} more person${targetCount - 1 > 1 ? "s" : ""}`}
                        </p>
                    </div>
                    {targetCount && (
                        <div className="px-2.5 py-1 bg-[#002970] rounded-full">
                            <span className="text-[12px] font-black text-white">
                                {selected.length}/{targetCount}
                            </span>
                        </div>
                    )}
                </div>

                {/* Limit Banner */}
                {targetCount && (
                    <div className="mx-1 px-3 py-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center gap-2">
                        <Lock size={12} className="text-blue-500 flex-shrink-0" />
                        <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
                            Splitting between exactly <span className="font-black">{targetCount} people</span>. You (Me) is always included.
                        </p>
                    </div>
                )}

                {/* Search Box */}
                <div className="relative px-1">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search contacts..."
                        className="w-full h-11 pl-4 pr-10 rounded-xl text-[14px] font-medium outline-none border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] bg-[#F5F7F8] dark:bg-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400 transition-colors"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Contact List */}
                <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto px-1">
                    {filtered.map((contact) => {
                        const sel = isSelected(contact.id);
                        const isMe = contact.id === "me";
                        const disabled = !sel && atLimit && !isMe;
                        return (
                            <motion.button
                                key={contact.id}
                                onClick={() => toggleContact(contact)}
                                whileTap={isMe ? {} : { scale: 0.98 }}
                                disabled={disabled}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${sel
                                        ? "bg-[#E5F1FB] dark:bg-[#002970]/20 border-[#00B9F1]"
                                        : disabled
                                            ? "border-transparent opacity-40"
                                            : "border-transparent hover:bg-gray-50 dark:hover:bg-[#1A1A1A]"
                                    }`}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-black flex-shrink-0"
                                    style={{ backgroundColor: contact.color }}
                                >
                                    {contact.initials}
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="text-[14px] font-bold text-gray-900 dark:text-white leading-tight">
                                        {contact.name}
                                        {isMe && <span className="ml-1.5 text-[10px] font-medium text-[#00B9F1] bg-[#00B9F1]/10 px-1.5 py-0.5 rounded-full">Locked</span>}
                                    </p>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{contact.upi}</p>
                                </div>
                                <div
                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${sel ? "bg-[#00B9F1] border-[#00B9F1]" : "border-gray-300 dark:border-gray-600"
                                        }`}
                                >
                                    {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                                </div>
                            </motion.button>
                        );
                    })}
                </div>

                {/* Live Math */}
                <AnimatePresence>
                    {selected.length > 1 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="mx-1 p-3 bg-gradient-to-r from-[#002970]/10 to-[#00B9F1]/10 border border-[#00B9F1]/30 rounded-xl flex items-center justify-between"
                        >
                            <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-[#00B9F1]" />
                                <span className="text-[12px] font-bold text-gray-600 dark:text-gray-300">
                                    ₹{totalAmount.toLocaleString("en-IN")} ÷ {selected.length} people
                                </span>
                            </div>
                            <span className="text-[16px] font-black text-[#002970] dark:text-[#00B9F1]">
                                ₹{perPerson.toLocaleString("en-IN")} each
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Confirm Button */}
                <button
                    onClick={() => selected.length > 1 && setStep("confirm")}
                    disabled={selected.length < 2}
                    className="w-full py-4 mt-1 bg-[#00B9F1] text-white text-[15px] font-black rounded-2xl shadow-lg shadow-[#00B9F1]/20 transition-transform active:scale-95 disabled:opacity-40"
                >
                    {selected.length < 2 ? "Select at least 1 more person" : `Review Split (${selected.length} people)`}
                </button>
            </motion.div>
        );
    }

    // ── Step: Confirmation ──────────────────────────────────────────────────
    if (step === "confirm") {
        const nonMeContacts = selected.filter(c => c.id !== "me");
        return (
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col gap-4 py-2 px-1"
            >
                <div>
                    <h3 className="text-[15px] font-black text-gray-900 dark:text-white">Confirm Split</h3>
                    <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">Review requests before sending</p>
                </div>

                <div className="p-4 bg-gradient-to-br from-[#002970] to-[#003a8c] rounded-2xl text-white">
                    <p className="text-[12px] font-medium opacity-70 mb-1">{title}</p>
                    <p className="text-[28px] font-black">₹{totalAmount.toLocaleString("en-IN")}</p>
                    <p className="text-[13px] font-medium opacity-80 mt-1">
                        Split {selected.length} ways · ₹{perPerson.toLocaleString("en-IN")} each
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    {/* Me row */}
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-[#E5F1FB] dark:bg-[#002970]/20 rounded-xl border border-[#00B9F1]/30">
                        <div className="w-10 h-10 rounded-full bg-[#002970] flex items-center justify-center text-white text-[12px] font-black flex-shrink-0">
                            ME
                        </div>
                        <div className="flex-1">
                            <p className="text-[13px] font-bold text-gray-900 dark:text-white">You (paid in full)</p>
                            <p className="text-[11px] text-gray-500">Your share: ₹{myShare.toLocaleString("en-IN")}</p>
                        </div>
                        <span className="text-[14px] font-black text-gray-500 line-through">₹{totalAmount.toLocaleString("en-IN")}</span>
                    </div>

                    {/* Other contacts */}
                    {nonMeContacts.map((contact) => (
                        <div key={contact.id} className="flex items-center gap-3 px-3 py-2.5 bg-[#F5F7F8] dark:bg-[#1A1A1A] rounded-xl">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-black flex-shrink-0"
                                style={{ backgroundColor: contact.color }}
                            >
                                {contact.initials}
                            </div>
                            <div className="flex-1">
                                <p className="text-[13px] font-bold text-gray-900 dark:text-white">{contact.name}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">{contact.upi}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[14px] font-black text-[#00B9F1]">₹{perPerson.toLocaleString("en-IN")}</p>
                                <p className="text-[10px] text-gray-400">Request →</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setStep("picker")}
                        className="flex-1 py-3.5 bg-gray-100 dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400 text-[14px] font-bold rounded-2xl transition-transform active:scale-95"
                    >
                        Back
                    </button>
                    <button
                        onClick={() => {
                            setStep("sent");
                            onConfirm(nonMeContacts, perPerson);
                        }}
                        className="flex-[2] py-3.5 bg-[#00B9F1] text-white text-[14px] font-black rounded-2xl shadow-lg shadow-[#00B9F1]/20 flex items-center justify-center gap-2 transition-transform active:scale-95"
                    >
                        <Send size={16} />
                        Send {nonMeContacts.length} Request{nonMeContacts.length > 1 ? "s" : ""}
                    </button>
                </div>
            </motion.div>
        );
    }

    // ── Step: Sent! ───────────────────────────────────────────────────────────
    const nonMeContacts = selected.filter(c => c.id !== "me");
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-5 py-8 px-2"
        >
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.1 }}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00B9F1] to-[#002970] flex items-center justify-center shadow-xl shadow-[#00B9F1]/30"
            >
                <Check size={36} className="text-white" strokeWidth={3} />
            </motion.div>
            <div className="text-center">
                <h3 className="text-[20px] font-black text-gray-900 dark:text-white mb-1">Requests Sent!</h3>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 max-w-[240px] mx-auto leading-relaxed">
                    Payment request of{" "}
                    <span className="font-black text-[#002970] dark:text-[#00B9F1]">₹{perPerson.toLocaleString("en-IN")}</span>{" "}
                    sent to {nonMeContacts.map((c) => c.name.split(" ")[0]).join(" & ")} for{" "}
                    <span className="font-bold text-gray-900 dark:text-white">{title}</span>.
                    You paid ₹{myShare.toLocaleString("en-IN")} yourself.
                </p>
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
                {nonMeContacts.map((c) => (
                    <div key={c.id} className="px-3 py-1 rounded-full text-white text-[11px] font-bold" style={{ backgroundColor: c.color }}>
                        {c.name.split(" ")[0]} ✓
                    </div>
                ))}
            </div>
            <div className="w-full p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-2">
                <Users size={14} className="text-green-600 flex-shrink-0" />
                <p className="text-[12px] font-medium text-green-700 dark:text-green-400">
                    ₹{totalAmount.toLocaleString("en-IN")} deducted from your balance. You&apos;ll be reimbursed once friends pay back.
                </p>
            </div>
            <button onClick={onClose} className="w-full py-4 bg-[#002970] text-white text-[15px] font-black rounded-2xl active:scale-95 transition-transform">
                Done
            </button>
        </motion.div>
    );
}
