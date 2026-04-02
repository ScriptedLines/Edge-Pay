"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  Sparkles, Zap, ShieldCheck, Scan, Smartphone, Landmark,
  Send, UserCheck, History, Car, Calendar, Search, Bell, Menu, Loader2, AlertCircle,
  CreditCard, Banknote, TrendingUp, BarChart3, Settings, Moon, Sun, ChevronRight
} from "lucide-react";
import { useTheme } from "next-themes";
import ActionReceiptCard from "@/components/ui/ActionReceiptCard";
import SwipeToConfirm from "@/components/ui/SwipeToConfirm";
import BottomSheetContainer from "@/components/ui/BottomSheetContainer";
import NetworkToggle from "@/components/ui/NetworkToggle";
import TrustScoreBadge from "@/components/ui/TrustScoreBadge";
import BleSoundboxSim from "@/components/ui/BleSoundboxSim";
import ReceiverReceiptSlip from "@/components/ui/ReceiverReceiptSlip";
import PaytmSuccessScreen from "@/components/ui/PaytmSuccessScreen";
import InteractiveSplitCard from "@/components/ui/InteractiveSplitCard";
import InvalidPromptCard from "@/components/ui/InvalidPromptCard";
import { predictIntent } from "@/lib/ml";
import { initTrustEngine, computeTrustLimit } from "@/lib/trust_engine";
import ReceiveOfflineQR from "@/components/ui/ReceiveOfflineQR";
import OfflineScannerSim from "@/components/ui/OfflineScannerSim";
import { transmitP2PPayload } from "@/lib/ble/NativeP2PService";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedAction {
  id: string;
  type: string;
  title: string;
  target: string;
  amount: number;
  icon: string;
  upiId?: string;
  targetCount?: number; // for split: total people including user
}

interface ParseResponse {
  category?: "financial" | "navigate" | "action" | "invalid";
  actions: ParsedAction[];
  ui_target?: string;
  command?: string;
  error_message?: string;
}

const ICON_MAP: Record<string, "users" | "wifi" | "zap" | "cart" | "card" | "smartphone"> = {
  Users: "users",
  Wifi: "wifi",
  Zap: "zap",
  ShoppingCart: "cart",
  CreditCard: "card",
  Smartphone: "smartphone",
  Ticket: "card",
  Send: "zap"
};

// ── App Page ──────────────────────────────────────────────────────────────────

export default function NativePaytmClone() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionPlan, setActionPlan] = useState<ParseResponse | null>(null);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    // Force balance reset for user
    if (typeof window !== 'undefined' && !localStorage.getItem('forced_40k_reset')) {
      setBankBalance(40000);
      localStorage.setItem('forced_40k_reset', 'true');
      localStorage.setItem('paytm_session_start_balance', '40000');
    }
  }, []);

  // Sheet State Machine
  const [sheetMode, setSheetMode] = useState<"intent" | "repay" | "quickAction" | "history" | "profile" | "notifications" | "receiveQR" | "scanQR" | null>(null);
  const [showSoundbox, setShowSoundbox] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTxMeta, setLastTxMeta] = useState<{ amount: number; target: string; tokenId: string; ts: number } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "success">("idle");

  // Authentic Paytm success screen
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [successMeta, setSuccessMeta] = useState<{ amount: number; target: string; upiId?: string } | null>(null);

  // Interactive Split flow
  const [showSplitCard, setShowSplitCard] = useState(false);
  const [splitMeta, setSplitMeta] = useState<{ title: string; totalAmount: number; targetCount?: number } | null>(null);

  // Invalid prompt overlay
  const [showInvalidCard, setShowInvalidCard] = useState(false);
  const [invalidMeta, setInvalidMeta] = useState<{ message: string; prompt: string } | null>(null);

  // Modal Inputs
  const [repayMode, setRepayMode] = useState<"full" | "custom">("full");
  const [customRepayAmount, setCustomRepayAmount] = useState("");

  // Quick Action Forms
  const [activeQuickAction, setActiveQuickAction] = useState<{ id: string; title: string; prompt: string; targetLabel: string } | null>(null);
  const [quickActionName, setQuickActionName] = useState("");
  const [quickActionUpiId, setQuickActionUpiId] = useState("");
  const [quickActionAmount, setQuickActionAmount] = useState("");
  const [sheetTitle, setSheetTitle] = useState("Action Plan");

  const handleQuickActionClick = (id: string, title: string, targetLabel: string, prompt: string) => {
    setActiveQuickAction({ id, title, prompt, targetLabel });
    setQuickActionName("");
    setQuickActionUpiId("");
    setQuickActionAmount("");
    setSheetTitle(title);
    setSheetMode("quickAction");
  };

  // === App Network Config (localStorage-backed) ===
  const [backendUrl, setBackendUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return "http://localhost:8000";
    return localStorage.getItem('paytm_backend_url') || "http://localhost:8000";
  });

  // === Ledger & Bank States (localStorage-backed) ===
  const [bankBalance, setBankBalance] = useState<number>(() => {
    if (typeof window === 'undefined') return 40000;
    const s = localStorage.getItem('paytm_bank_balance');
    return s ? Number(s) : 40000;
  });
  const [transactions, setTransactions] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [
      { id: 'tt-1', date: Date.now() - 7200000, title: 'Paid to', target: 'Zomato', amount: 450, type: 'debit' },
      { id: 'tt-2', date: Date.now() - 86400000, title: 'Money Received', target: 'Amit', amount: 1500, type: 'credit' }
    ];
    try {
      const s = localStorage.getItem('paytm_transactions');
      return s ? JSON.parse(s) : [
        { id: 'tt-1', date: Date.now() - 7200000, title: 'Paid to', target: 'Zomato', amount: 450, type: 'debit' },
        { id: 'tt-2', date: Date.now() - 86400000, title: 'Money Received', target: 'Amit', amount: 1500, type: 'credit' }
      ];
    } catch { return []; }
  });

  // === Dynamic Notifications (localStorage-backed) ===
  const [notifications, setNotifications] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try { const s = localStorage.getItem('paytm_notifications'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [unreadCount, setUnreadCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('paytm_unread') || '0');
  });

  const pushNotification = (title: string, desc: string, icon: 'zap' | 'shield' | 'alert') => {
    const n = { id: `n-${Date.now()}`, title, desc, icon, ts: Date.now() };
    setNotifications(prev => {
      const updated = [n, ...prev].slice(0, 30);
      localStorage.setItem('paytm_notifications', JSON.stringify(updated));
      return updated;
    });
    setUnreadCount(prev => { const next = prev + 1; localStorage.setItem('paytm_unread', String(next)); return next; });
  };

  // === Edge-Pay Offline / Simulator States ===
  const [isOnline, setIsOnline] = useState(true);
  const [offlineStartTime, setOfflineStartTime] = useState<number | null>(null);
  const [pendingOfflineTransactions, setPendingOfflineTransactions] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('paytm_pending_offline') || '[]'); } catch { return []; }
  });
  // Guarantor Block States
  const [negativeBalance, setNegativeBalance] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('paytm_neg_balance') || '0');
  });
  const isAccountBlocked = negativeBalance > 0;

  // === Dynamic AI Edge-Score Engine ===
  const [edgeScore, setEdgeScore] = useState<number>(50);
  const [offlineLimit, setOfflineLimit] = useState<number>(0);
  const [aiMaxAmount, setAiMaxAmount] = useState<number>(0);
  const [balanceDrain, setBalanceDrain] = useState<number>(0);
  const [gruRiskDisplay, setGruRiskDisplay] = useState<number>(0);
  const [isColdStart, setIsColdStart] = useState<boolean>(false);
  const [trustPoints, setTrustPoints] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('paytm_trust_points') || '0');
  });
  // Track the session starting balance (highest balance seen = the starting point)
  const [startingBalance] = useState<number>(() => {
    if (typeof window === 'undefined') return 40000;
    return Number(localStorage.getItem('paytm_session_start_balance') || '40000');
  });

  const runTrustEngine = (elapsedHours: number = 0) => {
    initTrustEngine().then(() => {
      computeTrustLimit(transactions, bankBalance, startingBalance, elapsedHours).then((res) => {
        setEdgeScore(res.trustScore);
        setAiMaxAmount(res.maxAmount);
        setBalanceDrain(res.balanceDrainPct);
        setGruRiskDisplay(Math.round(res.gruRisk * 100));
        setIsColdStart(!!res.isColdStart);
        if (negativeBalance > 0 || res.isColdStart) {
          setOfflineLimit(0);
        } else {
          setOfflineLimit(res.edgeLimit);
        }
      });
    });
  };

  // Re-run inference whenever balance/txns change
  useEffect(() => {
    const elapsed = offlineStartTime
      ? (Date.now() - offlineStartTime) / 3600000
      : 0;
    runTrustEngine(elapsed);
  }, [transactions, bankBalance, negativeBalance, startingBalance, offlineStartTime]);

  // While offline: re-run every 60 seconds to apply time-based decay
  useEffect(() => {
    if (isOnline || !offlineStartTime) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - offlineStartTime) / 3600000;
      runTrustEngine(elapsed);
    }, 60_000);
    return () => clearInterval(interval);
  }, [isOnline, offlineStartTime, transactions, bankBalance]);


  const trustTier = edgeScore >= 80 ? "High" : edgeScore >= 50 ? "Moderate" : edgeScore >= 20 ? "Low" : "Blocked";
  const trustColor = edgeScore >= 80 ? "#22c55e" : edgeScore >= 50 ? "#f59e0b" : edgeScore >= 20 ? "#f97316" : "#ef4444";
  const isPaymentBlocked = edgeScore < 20 || isAccountBlocked;


  // === Auto-Sync Modal State ===
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Sync Logic
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // === AI Persona Sandbox Injector ===
  const applyPersona = (type: string) => {
    setOfflineStartTime(null);
    setPendingOfflineTransactions([]);
    setNegativeBalance(0);

    const now = Date.now();
    const hr = 3600000;
    const day = 24 * hr;

    let bal = 0;
    let txs: any[] = [];
    let startBalStr = "40000";

    switch (type) {
      case "veteran":
        bal = 100000;
        startBalStr = "100000";
        for (let i = 0; i < 20; i++) txs.push({ id: `tx-${i}`, date: now - (i * 12 * hr), title: "Regular Payment", target: "Merchant", amount: 400 + Math.random() * 200, type: "debit" });
        break;
      case "scammer":
        bal = 400;
        startBalStr = "40000"; // Fake a drain from 40k to 400
        for (let i = 0; i < 18; i++) txs.push({ id: `tx-${i}`, date: now - (i * 1.5 * hr), title: "Suspicious Payment", target: "Unknown", amount: 2000 + Math.random() * 500, type: "debit" });
        break;
      case "student":
        bal = 3500;
        startBalStr = "8000";
        for (let i = 0; i < 15; i++) txs.push({ id: `tx-${i}`, date: now - (i * 20 * hr), title: "Snacks", target: "Canteen", amount: 150 + Math.random() * 50, type: "debit" });
        break;
      case "fresh":
        bal = 10000;
        startBalStr = "10000";
        txs.push({ id: "tx-1", date: now - (1 * day), title: "First Payment", target: "Shop", amount: 500, type: "debit" });
        txs.push({ id: "tx-2", date: now - (2 * day), title: "Mobile Recharge", target: "Jio", amount: 299, type: "debit" });
        break;
      case "merchant":
        bal = 40000;
        startBalStr = "40000";
        for (let i = 0; i < 20; i++) txs.push({ id: `tx-${i}`, date: now - (i * 8 * hr), title: "Received", target: `Customer ${i}`, amount: 500 + Math.random() * 1000, type: "credit" });
        break;
    }

    localStorage.setItem("paytm_session_start_balance", startBalStr);
    setBankBalance(bal);
    setTransactions(txs);
    setSheetMode(null);
  };

  // Persist ledger & offline state to localStorage on every change
  useEffect(() => { localStorage.setItem('paytm_bank_balance', String(bankBalance)); }, [bankBalance]);
  useEffect(() => { localStorage.setItem('paytm_transactions', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('paytm_neg_balance', String(negativeBalance)); }, [negativeBalance]);
  useEffect(() => { localStorage.setItem('paytm_pending_offline', JSON.stringify(pendingOfflineTransactions)); }, [pendingOfflineTransactions]);
  useEffect(() => { localStorage.setItem('paytm_trust_points', String(trustPoints)); }, [trustPoints]);

  // Auto-Sync Modal trigger
  useEffect(() => {
    if (isOnline && pendingOfflineTransactions.length > 0 && !showSyncModal) {
      setShowSyncModal(true);
    }
  }, [isOnline, pendingOfflineTransactions.length]);

  // Edge-Pay Limit Accounting
  const pendingDues = pendingOfflineTransactions.reduce((sum, t) => sum + t.amount, 0);
  const availableLimit = Math.max(0, offlineLimit - pendingDues);

  const total = actionPlan?.actions
    ? actionPlan.actions.reduce((sum, a) => sum + a.amount, 0)
    : 0;
  const totalLabel = `₹${total.toLocaleString("en-IN")}`;

  const localFallbackParse = (text: string): ParseResponse | null => {
    const amountMatch = text.match(/\d+(,\d+)*(\.\d+)?/);
    const amount = amountMatch ? parseInt(amountMatch[0].replace(/,/g, "")) : 0;
    if (amount <= 0) return null;

    let target = "Merchant";
    let upiId = undefined;

    // Look for UPI ID (contains @)
    const upiMatch = text.match(/([a-zA-Z0-9.\-_]+@[a-zA-Z]+)/);
    if (upiMatch) {
      upiId = upiMatch[1];
    }

    // Filter out common prompt noise words to find the actual name
    const noiseWords = ["scan", "merchant", "qr", "pay", "to", "send", "money", "anyone", "bank", "account", "transfer"];

    if (text.toLowerCase().includes("pay") || text.toLowerCase().includes("scan")) {
      const parts = text.split(/pay|to|scan|send|transfer/i);
      // Logic: skip segments that appear in noiseWords or are just prompt noise
      for (const part of parts) {
        let cleaned = part.replace(/\d+/g, "").replace(upiId || "", "").trim();
        // More robust noise check: segment is only a name if it doesn't just contain noise words
        const isNoise = cleaned.toLowerCase().split(/\s+/).every(word => noiseWords.includes(word));
        if (cleaned && cleaned.length > 1 && !isNoise) {
          target = cleaned;
          break;
        }
      }
    } else {
      // Fallback: take everything before UPI or amount as name, ignoring noise
      const cleaned = text.replace(/\d+/g, "").replace(upiId || "", "").trim();
      const parts = cleaned.split(/\s+/);
      const filtered = parts.filter(p => !noiseWords.includes(p.toLowerCase()));
      if (filtered.length > 0) target = filtered.join(" ");
    }

    // Capitalize target
    if (target !== "Merchant") {
      target = target.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    }

    // Detect split/divide intent
    const isSplit = /split|divide|share between|share with/i.test(text);
    // Extract a title for the split (e.g., "wifi bill", "dinner bill")
    const billMatch = text.match(/(?:the\s+)?([a-zA-Z\s]+?)\s+(?:bill|cost|fee|charge)/i);
    const splitTitle = billMatch ? billMatch[1].trim() : (target !== "Merchant" ? target : "Bill");

    return {
      actions: [
        {
          id: `edge-${Date.now()}`,
          type: isSplit ? "split" : "pay",
          title: isSplit ? splitTitle : "Edge-Pay Trust Routing",
          target: target,
          upiId: upiId,
          amount: amount,
          icon: isSplit ? "users" : "card",
        }
      ]
    };
  };

  const handleSubmit = async (overrideText?: string | React.MouseEvent | React.KeyboardEvent) => {
    const textToSubmit = typeof overrideText === "string" ? overrideText : inputValue;
    const trimmed = textToSubmit.trim();
    if (!trimmed || isProcessing) return;

    if (typeof overrideText === "string") setInputValue(trimmed);

    setIsProcessing(true);
    setActionPlan(null);
    setPaymentStatus("idle");
    setShowSoundbox(false);

    try {
      // ── LOCAL ON-DEVICE ML EXECUTION (Zero External API) ────────────────
      const result = await predictIntent(trimmed);

      if (!result) {
        throw new Error("Local ML Engine failed to categorize the request.");
      }

      const { intentId, category, params, text } = result;
      let data: ParseResponse = { category: category as any, actions: [] };

      // Map ML intent to schema
      if (category === "financial") {
        data.actions = [{
          id: `tx-${Date.now()}`,
          type: intentId as any,
          title: intentId === "split" ? "Bill Split" : "Payment Routing",
          target: "Merchant",
          amount: params?.amount || 0,
          targetCount: params?.targetCount,
          icon: intentId === "split" ? "users" : "wifi"
        }];

        if (!data.actions[0].amount) {
          data.category = "invalid";
          data.error_message = `I understand you want to ${intentId}, but I couldn't find an exact amount. Please include a number.`;
        }
      } else if (category === "navigate") {
        data.ui_target = intentId === "history" ? "history_sheet" : "profile_sheet";
      } else if (category === "action") {
        data.command = intentId === "theme" ? "toggle_theme" : "";
      } else {
        data.error_message = `I'm an offline Edge AI. I can't "${text}". Try "Pay 500" or "Split bill between 3".`;
      }

      // ── UNIVERSAL ROUTER ────────────────────────────────────────────────
      const cat = data.category;

      if (cat === "navigate" && data.ui_target) {
        const mode = data.ui_target === "history_sheet" ? "history" : "profile";
        setSheetMode(mode as any);
        setSheetTitle(data.ui_target === "history_sheet" ? "Balance & History" : "My Profile");
        setIsProcessing(false);
        setInputValue("");
        return;
      }

      if (cat === "action" && data.command) {
        if (data.command === "toggle_theme") {
          setTheme(theme === "dark" ? "light" : "dark");
        }
        setIsProcessing(false);
        setInputValue("");
        return;
      }

      if (cat === "invalid") {
        setInvalidMeta({ message: data.error_message || "", prompt: trimmed });
        setShowInvalidCard(true);
        setIsProcessing(false);
        setInputValue("");
        return;
      }

      // Financial Limits and Augmentation
      const totalRequested = data.actions.reduce((sum, a) => sum + a.amount, 0);
      if (totalRequested > availableLimit) {
        setInvalidMeta({
          message: `Trust Limit Exceeded! Requested ₹${totalRequested} but your available limit is ₹${availableLimit}.`,
          prompt: trimmed
        });
        setShowInvalidCard(true);
        setIsProcessing(false);
        return;
      }

      // Use basic local regex mapping for specific target names
      const fallback = localFallbackParse(trimmed);
      if (data.actions && data.actions.length > 0 && fallback && fallback.actions.length > 0) {
        const mainAction = data.actions[0];
        const localAction = fallback.actions[0];
        if (!mainAction.upiId) mainAction.upiId = localAction.upiId;
        if (mainAction.target === "Merchant" && localAction.target !== "Merchant") {
          mainAction.target = localAction.target;
        }
      }

      setActionPlan(data);
      setSheetMode("intent");
    } catch (err: any) {
      console.error("Local ML Engine error:", err);
      setInvalidMeta({ message: err.message || "The Edge-AI model is still loading. Please try again in a few seconds.", prompt: trimmed });
      setShowInvalidCard(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch (e) { }

    // Intercept split action — launch interactive split card instead of paying
    if (actionPlan && actionPlan.actions.length > 0 && actionPlan.actions[0].type === "split") {
      const splitAction = actionPlan.actions[0];
      setSplitMeta({
        title: splitAction.title || splitAction.target,
        totalAmount: splitAction.amount,
        targetCount: splitAction.targetCount
      });
      setSheetMode(null);
      setShowSplitCard(true);
      return;
    }

    setPaymentStatus("processing");
    if (!isOnline && actionPlan) {
      setTimeout(() => {
        setPendingOfflineTransactions((prev) => [...prev, ...actionPlan.actions]);

        const totalDed = actionPlan.actions.reduce((s, a) => s + a.amount, 0);
        setBankBalance(p => p - totalDed);
        const newTxs = actionPlan.actions.map(a => ({ id: `tx-${Date.now()}-${Math.random()}`, date: Date.now(), title: "Edge-Pay Offline", target: a.target, amount: a.amount, type: "debit", settled: false }));
        setTransactions(prev => [...newTxs, ...prev]);

        // Generate preliminary token — BLE component will update with the real HMAC-signed tokenId
        const token = `EP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
        const ts = Date.now();
        setLastTxMeta({ amount: totalDed, target: actionPlan.actions[0]?.target || 'Merchant', tokenId: token, ts });
        setShowSoundbox(true);
        setPaymentStatus('success');
        try { Haptics.impact({ style: ImpactStyle.Medium }); } catch (e) { }
        pushNotification(
          'Edge-Pay Offline',
          `₹${totalDed.toLocaleString('en-IN')} sent to ${actionPlan.actions[0]?.target} via BLE Soundbox. Pending bank settlement.`,
          'zap'
        );

        // After soundbox completes (4.5s), show receipt
        setTimeout(() => {
          setShowSoundbox(false);
          setShowReceipt(true);
        }, 5000);

        // Auto-close receipt after 12s total
        setTimeout(() => {
          setSheetMode(null);
          setInputValue("");
          setActionPlan(null);
          setShowReceipt(false);
          setPaymentStatus("idle");
        }, 12000);
      }, 500);
    } else {
      setTimeout(() => {
        setPaymentStatus("success");
        try { Haptics.impact({ style: ImpactStyle.Medium }); } catch (e) { }
        if (actionPlan) {
          const totalDed = actionPlan.actions.reduce((s, a) => s + a.amount, 0);
          const target = actionPlan.actions[0]?.target || "Merchant";
          const upiId = actionPlan.actions[0]?.upiId;

          setBankBalance(p => p - totalDed);
          setTransactions(prev => [
            ...actionPlan.actions.map(a => ({ id: `tx-${Date.now()}-${Math.random()}`, date: Date.now(), title: 'Paid via Zero-UI', target: a.target, amount: a.amount, type: 'debit' })),
            ...prev
          ]);

          pushNotification(
            'Payment Successful',
            `₹${totalDed.toLocaleString('en-IN')} paid to ${target} via UPI.`,
            'shield'
          );

          // Show authentic Paytm success screen
          setSuccessMeta({ amount: totalDed, target, upiId });
          setSheetMode(null);
          setShowSuccessScreen(true);

          // Clear inputs after showing success screen (state cleanup)
          setInputValue("");
          setActionPlan(null);
          setPaymentStatus("idle");
        }
      }, 1000);
    }
  };

  if (!mounted) {
    return <div className="min-h-[100dvh] bg-[#0A0A0A] w-full max-w-[440px] mx-auto" />;
  }

  return (
    <main className="relative min-h-[100dvh] bg-white dark:bg-[#0A0A0A] text-black dark:text-white font-sans overflow-x-hidden w-full max-w-[440px] mx-auto pb-32">

      {/* ── Interactive Split Card Overlay ────────────────────────────────── */}
      <AnimatePresence>
        {showSplitCard && splitMeta && (
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
              className="w-full max-w-[440px] mx-auto bg-white dark:bg-[#111111] rounded-t-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[17px] font-black text-gray-900 dark:text-white">Split Bill</h2>
                <button
                  onClick={() => { setShowSplitCard(false); setSplitMeta(null); }}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#1A1A1A] flex items-center justify-center"
                >
                  <span className="text-gray-500 text-lg leading-none">×</span>
                </button>
              </div>
              <InteractiveSplitCard
                title={splitMeta.title}
                totalAmount={splitMeta.totalAmount}
                targetCount={splitMeta.targetCount}
                onClose={() => {
                  setShowSplitCard(false);
                  setSplitMeta(null);
                  setInputValue("");
                  setActionPlan(null);
                }}
                onConfirm={(contacts, perPerson) => {
                  // Deduct full amount from balance (you paid the bill)
                  setBankBalance(prev => prev - splitMeta.totalAmount);
                  const newTx = {
                    id: `tx-${Date.now()}`,
                    date: Date.now(),
                    title: `Split: ${splitMeta.title}`,
                    target: contacts.map(c => c.name.split(" ")[0]).join(", "),
                    amount: splitMeta.totalAmount,
                    type: "debit",
                    settled: true,
                  };
                  setTransactions(prev => [newTx, ...prev]);
                  pushNotification(
                    'Split Requests Sent!',
                    `₹${perPerson.toLocaleString('en-IN')} requested from ${contacts.length} contacts for "${splitMeta.title}".`,
                    'shield'
                  );
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Authentic Paytm Success Screen ─────────────────────────────────── */}
      <AnimatePresence>
        {showSuccessScreen && successMeta && (
          <PaytmSuccessScreen
            amount={successMeta.amount}
            target={successMeta.target}
            upiId={successMeta.upiId}
            onClose={() => {
              setShowSuccessScreen(false);
              setSuccessMeta(null);
              setInputValue("");
              setActionPlan(null);
              setPaymentStatus("idle");
            }}
            onPayAgain={() => {
              setShowSuccessScreen(false);
              setSuccessMeta(null);
              setPaymentStatus("idle");
              setActionPlan(null);
              setInputValue("");
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Auto-Sync Confirmation Modal ───────────────────────────────────── */}
      <AnimatePresence>
        {showSyncModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className="w-full max-w-[440px] bg-[#111] rounded-t-3xl px-5 pt-4 pb-10 border-t border-gray-800"
            >
              <div className="w-10 h-1 rounded-full bg-gray-700 mx-auto mb-5" />
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 bg-[#00B9F1] rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(0,185,241,0.4)]">
                  <Zap size={22} className="text-white" fill="white" />
                </div>
                <div>
                  <p className="text-[18px] font-extrabold text-white">You&apos;re back online!</p>
                  <p className="text-[13px] text-gray-400">{pendingOfflineTransactions.length} pending Edge-Pay transaction{pendingOfflineTransactions.length > 1 ? 's' : ''} found</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-5 max-h-[30vh] overflow-y-auto">
                {pendingOfflineTransactions.map((tx: any, i: number) => (
                  <div key={i} className="flex justify-between items-center bg-[#1A1A1A] px-4 py-3 rounded-2xl border border-gray-800">
                    <div>
                      <p className="text-[14px] font-bold text-white">{tx.target}</p>
                      <p className="text-[11px] text-gray-500">Edge-Pay Offline</p>
                    </div>
                    <p className="text-[16px] font-extrabold text-white">₹{(tx.amount || 0).toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center mb-5 px-1">
                <p className="text-[13px] text-gray-400 font-medium">Total Settlement</p>
                <p className="text-[20px] font-black text-[#00B9F1]">₹{pendingOfflineTransactions.reduce((s: number, t: any) => s + (t.amount || 0), 0).toLocaleString('en-IN')}</p>
              </div>

              <SwipeToConfirm
                label="Swipe to Confirm Settlement"
                onConfirm={async () => {
                  setShowSyncModal(false);
                  setIsSyncing(true);
                  setSyncMessage("Settling Edge-Pay dues with bank...");

                  try {
                    const response = await fetch(`${backendUrl}/api/sync`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        userId: "edgepay_user_1",
                        transactions: pendingOfflineTransactions
                      })
                    });

                    if (!response.ok) throw new Error("Sync failed");

                    const data = await response.json();

                    if (data.status === "success" || data.status === "partial_success") {
                      if (data.failedTransactions && data.failedTransactions.length > 0) {
                        // Guarantor triggered for some
                        const dues = pendingOfflineTransactions.filter((t: any) => data.failedTransactions.includes(t.id)).reduce((sum: number, t: any) => sum + t.amount, 0);
                        setNegativeBalance(dues);
                        setSyncMessage('Partial Bank Sync! Guarantor covered failed txns.');
                        pushNotification(
                          'Guarantor Intervention',
                          `Bank rejected some transactions. Paytm covered ₹${dues.toLocaleString('en-IN')}. Pay dues to unlock limits.`,
                          'alert'
                        );
                      } else {
                        setSyncMessage('Settlement Complete! Bank confirmed.');
                        setTrustPoints(prev => prev + 10);
                        pushNotification(
                          'Settlement Complete',
                          `All pending Edge-Pay transactions settled (₹${data.totalAmountSettled}). +10 Trust Points!`,
                          'shield'
                        );
                      }

                      setTransactions((prev: any[]) => prev.map((tx: any) => tx.settled === false ? { ...tx, settled: true, title: 'Edge-Pay Settled ✓' } : tx));
                      setPendingOfflineTransactions([]);
                    }
                  } catch (e) {
                    setSyncMessage('Network error during settlement.');
                    pushNotification('Sync Failed', 'Could not reach bank servers. Will retry later.', 'alert');
                  } finally {
                    setTimeout(() => setIsSyncing(false), 4000);
                  }
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white dark:bg-[#0A0A0A] border-b border-gray-100 dark:border-transparent">
        <div className="flex items-center gap-3">
          <button onClick={() => setSheetMode("profile")} className="w-[34px] h-[34px] rounded-full bg-[#E5F1FB] dark:bg-[#E5F1FB] flex items-center justify-center active:scale-95 transition-transform overflow-hidden font-bold text-[#002970]">
            AG
          </button>
          <div className="flex items-center gap-0.5 font-extrabold tracking-tight text-[18px]">
            <span className="text-black dark:text-white">paytm</span>
            <span className="text-red-500 ml-0.5 mr-1 text-[10px]">♥</span>
            <span className="italic dark:text-white">UPI</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-black dark:text-white">
          <Search size={22} className="opacity-90 dark:opacity-90" />
          <button onClick={() => { setSheetMode("notifications"); setUnreadCount(0); localStorage.setItem('paytm_unread', '0'); }} className="relative active:scale-95 transition-transform">
            <Bell size={22} className="opacity-90 dark:opacity-90" />
            {unreadCount > 0 && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border border-white dark:border-[#0A0A0A] flex items-center justify-center"><span className="text-[9px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span></div>}
          </button>
          <NetworkToggle isOnline={isOnline} onToggle={(state) => {
            setIsOnline(state);
            if (!state) {
              // Going offline: record the exact moment
              setOfflineStartTime(Date.now());
            } else {
              // Coming back online: reset elapsed timer
              setOfflineStartTime(null);
            }
          }} />
        </div>
      </header>


      {/* Background Sync Sticky Note */}
      <AnimatePresence>
        {isSyncing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="mx-4 mt-2 px-4 py-3 rounded-xl shadow border border-gray-100 dark:border-gray-800 flex items-center gap-2.5 whitespace-nowrap bg-white dark:bg-[#1A1A1A]"
          >
            {syncMessage.includes("Syncing") ? (
              <Zap size={15} color="#00B9F1" fill="#00B9F1" className="animate-pulse" />
            ) : (
              <ShieldCheck size={15} color="#16a34a" />
            )}
            <span className="text-[13px] font-semibold text-gray-800 dark:text-white">
              {syncMessage}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 mt-4">
        <div className="w-full bg-[#111827] rounded-3xl p-5 flex justify-between items-center relative overflow-hidden">
          <div className="z-10 mt-1">
            <h3 className="text-[17px] font-bold text-white leading-[1.3] mb-3">
              Super Secure Payments<br />with <span className="text-[#00B9F1]">Fingerprint</span>
            </h3>
            <button className="bg-white text-black text-[12px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
              Activate Now <span className="font-normal">&gt;</span>
            </button>
          </div>
          {/* User Uploaded Phone Graphic */}
          <div className="absolute -right-4 top-0 bottom-0 h-[135%] w-48 -mt-6 pointer-events-none">
            <img src="/banner.png" alt="Fingerprint Secure Scanner" className="w-full h-full object-contain object-right-bottom mix-blend-screen" />
          </div>
        </div>
      </div>

      {/* ── UPI Block ──────────────────────────────────────────────────────── */}
      <div className="px-3 mt-4">
        <div className="bg-[#F5F7F8] dark:bg-[#1A1A1A] rounded-[24px] p-5 pt-5 pb-6 border border-gray-100 dark:border-transparent transition-colors">
          <h2 className="text-[15px] font-bold text-gray-800 dark:text-white mb-6">UPI Money Transfer</h2>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: "scan", i: Scan, l: "Scan any\nQR", action: () => setSheetMode("scanQR") },
              { id: "receive", i: Smartphone, l: "Receive\nOffline", action: () => setSheetMode("receiveQR") },
              { id: "pay", i: UserCheck, l: "Pay\nAnyone", action: () => handleQuickActionClick("pay", "Pay Anyone", "Contact Name", "Send money to contact {target} {amount}") },
              { id: "history", i: History, l: "Balance &\nHistory", action: () => { setSheetMode("history"); setSheetTitle("Balance & History"); } }
            ].map((x) => (
              <div key={x.l} className="flex flex-col items-center gap-2 cursor-pointer group" onClick={x.action}>
                <div className="w-14 h-14 bg-[#00B9F1] rounded-full flex items-center justify-center transition-transform active:scale-95 group-active:scale-95">
                  <x.i size={24} className="text-white" strokeWidth={1.5} />
                </div>
                <span className="text-[11px] font-medium text-center whitespace-pre-wrap leading-tight text-gray-700 dark:text-white/90">{x.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* ── AI NLP Block (Mapped exactly between blocks) ───────────────────── */}
      <div className="px-3 mt-4 relative z-10 w-full group">
        <div className="absolute -inset-[2px] bg-gradient-to-r from-[#002970] via-[#00B9F1] to-[#002970] rounded-[26px] opacity-ba opacity-40 group-hover:opacity-70 transition duration-1000 filter blur-sm"></div>

        <div className="bg-white dark:bg-[#1A1A1A] rounded-[24px] p-4 flex flex-col gap-3 relative z-20 border border-gray-100 dark:border-gray-800 shadow-sm dark:shadow-none">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <Sparkles size={16} className="text-[#00B9F1]" />
              <h2 className="text-[14px] font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#00B9F1] to-blue-200">Zero-UI Intent Engine</h2>
            </div>

            {/* Edge Offline Trust Indicator */}
            {(!isOnline || isAccountBlocked) && (
              <div className="flex items-center gap-2">
                {pendingDues > 0 && !isAccountBlocked && (
                  <button onClick={() => setSheetMode("repay")} className="text-[10px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded font-bold">Clear Dues</button>
                )}
                <TrustScoreBadge
                  isBlocked={isAccountBlocked}
                  edgeScore={edgeScore}
                  edgeLimit={availableLimit}
                  balanceDrain={balanceDrain}
                  trustTier={trustTier}
                  trustColor={trustColor}
                  gruRisk={gruRiskDisplay}
                  elapsedHours={offlineStartTime ? (Date.now() - offlineStartTime) / 3600000 : 0}
                  isColdStart={isColdStart}
                />
              </div>
            )}
          </div>

          <div className="relative mt-1">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isPaymentBlocked || isProcessing}
              placeholder={isPaymentBlocked ? `Payments locked — Edge-Score: ${edgeScore}/100` : "e.g., 'Pay Airtel 500 and split with Ali'"}
              className="w-full bg-[#F5F7F8] dark:bg-[#0A0A0A] text-gray-900 dark:text-white rounded-[16px] py-4 pl-4 pr-14 text-[15px] outline-none border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] disabled:opacity-50 transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button
              disabled={!inputValue.trim() || isProcessing || isPaymentBlocked}
              onClick={handleSubmit}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#00B9F1] rounded-xl flex items-center justify-center disabled:opacity-30 transition-transform active:scale-90"
            >
              {isProcessing ? <Loader2 size={18} className="animate-spin text-white" /> : <Send size={18} className="text-white ml-0.5" />}
            </button>
          </div>

          {isPaymentBlocked && (
            <button onClick={() => setSheetMode("repay")} className="w-full py-3 mt-1 bg-red-600 text-white text-[14px] font-bold rounded-2xl shadow-[0_4px_16px_rgba(220,38,38,0.4)] transition-transform active:scale-95">
              🔒 Edge-Score: {edgeScore}/100 — {negativeBalance > 0 ? `Clear ₹${negativeBalance} dues` : 'Low bank balance'}
            </button>
          )}
        </div>
      </div>


      {/* ── Recharge & Bills Block ─────────────────────────────────────────── */}
      <div className="px-3 mt-4">
        <div className="bg-[#F5F7F8] dark:bg-[#1A1A1A] rounded-[24px] p-5 pt-5 pb-6 border border-gray-100 dark:border-transparent transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[15px] font-bold text-gray-800 dark:text-white">Recharge & Bills</h2>
            <span className="text-[12px] font-semibold text-[#00B9F1] cursor-pointer">View More</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: "mobile", i: Smartphone, l: "Mobile\nRecharge", t: "Provider (Jio, Airtel)", p: "Recharge {target} mobile {amount}" },
              { id: "fastag", i: Car, l: "FASTag\nRecharge", t: "Vehicle Number", p: "Recharge FASTag {target} for {amount}" },
              { id: "elec", i: Zap, l: "Electricity\nBill", t: "Electricity Provider", p: "Pay electricity bill {target} for {amount}" },
              { id: "loan", i: Calendar, l: "Loan EMI\nPayment", t: "Loan Provider", p: "Pay {target} loan EMI {amount}" }
            ].map((x) => (
              <div key={x.l} className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => handleQuickActionClick(x.id, x.l.replace("\n", " "), x.t, x.p)}>
                <div className="w-[46px] h-[46px] bg-white dark:bg-[#2A2A2A] rounded-2xl flex items-center justify-center transition-transform active:scale-95 group-active:scale-95 shadow-sm dark:shadow-none border border-gray-100 dark:border-transparent">
                  <x.i size={20} className="text-[#00B9F1]" strokeWidth={1.5} />
                </div>
                <span className="text-[10px] font-medium text-center whitespace-pre-wrap text-gray-500 dark:text-gray-400 leading-tight">{x.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* ── Loans & Wealth Block ─────────────────────────────────────────── */}
      <div className="px-3 mt-4 mb-24">
        <div className="bg-[#F5F7F8] dark:bg-[#1A1A1A] rounded-[24px] p-5 pt-5 pb-6 border border-gray-100 dark:border-transparent transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[15px] font-bold text-gray-800 dark:text-white">Loans & Wealth</h2>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: "postpaid", i: CreditCard, l: "Paytm\nPostpaid", action: "Check my Paytm Postpaid balance" },
              { id: "loan", i: Banknote, l: "Loan Upto\n15 Lakhs", action: "Check personal loan eligibility for 15L" },
              { id: "score", i: TrendingUp, l: "Free Credit\nScore", action: "Check my free CIBIL credit score" },
              { id: "sip", i: BarChart3, l: "Invest in\nSIPs", action: "Show top performing mutual fund SIPs" }
            ].map((x) => (
              <div key={x.l} className="flex flex-col items-center gap-2 cursor-pointer group" onClick={() => handleSubmit(x.action)}>
                <div className="w-[46px] h-[46px] bg-white dark:bg-[#2A2A2A] rounded-2xl flex items-center justify-center transition-transform active:scale-95 group-active:scale-95 shadow-sm dark:shadow-none border border-gray-100 dark:border-transparent">
                  <x.i size={20} className="text-[#00B9F1]" strokeWidth={1.5} />
                </div>
                <span className="text-[10px] font-medium text-center whitespace-pre-wrap text-gray-500 dark:text-gray-400 leading-tight">{x.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* ── Sub Navigation Floating Pill ───────────────────────────────────── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <button onClick={() => handleQuickActionClick("scan", !isOnline ? "Scan Edge-Pay" : "Scan QR", "Merchant Name / UPI ID", "Scan and pay merchant {target} {amount}")} className={`flex items-center gap-2 text-white px-7 py-3.5 rounded-full font-bold transition-transform active:scale-95 shadow-lg ${!isOnline ? "bg-blue-600 shadow-blue-500/50 border border-blue-400/50" : "bg-[#00B9F1] shadow-[0_8px_32px_rgba(0,185,241,0.5)]"}`}>
          {!isOnline ? <Smartphone size={20} className="animate-pulse" /> : <Scan size={20} />}
          <span className="text-[15px] tracking-wide whitespace-nowrap">{!isOnline ? `Edge-Pay Ready` : `Scan QR`}</span>
        </button>
      </div>

      {/* ── Bottom Sheet Modals ────────────────────────────────────────────── */}
      <BottomSheetContainer
        isOpen={sheetMode !== null}
        onClose={() => {
          setSheetMode(null);
          setShowSoundbox(false);
          setCustomRepayAmount("");
          setRepayMode("full");
          setActiveQuickAction(null);
        }}
        title={
          sheetMode === "repay" ? "Clear Pending Dues" :
            sheetMode === "history" ? "Passbook" :
              sheetMode === "profile" ? "Profile & Security" :
                sheetMode === "notifications" ? "Alerts" :
                  sheetMode === "quickAction" ? sheetTitle :
                    "Action Plan"
        }
      >
        {sheetMode === "quickAction" && activeQuickAction && (
          <div className="flex flex-col gap-4 py-3 px-1">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 pl-1 uppercase tracking-wider">{activeQuickAction.targetLabel}</label>
              <input
                type="text"
                value={quickActionName}
                onChange={(e) => setQuickActionName(e.target.value)}
                className="w-full h-14 px-4 rounded-xl text-[16px] font-bold outline-none border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] bg-[#F5F7F8] dark:bg-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
                placeholder="Enter details..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && quickActionName && quickActionAmount) {
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 pl-1 uppercase tracking-wider">UPI ID (Optional)</label>
              <input
                type="text"
                value={quickActionUpiId}
                onChange={(e) => setQuickActionUpiId(e.target.value)}
                className="w-full h-14 px-4 rounded-xl text-[16px] font-bold outline-none border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] bg-[#F5F7F8] dark:bg-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
                placeholder="e.g. merchant@ptsbi"
              />
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 pl-1 uppercase tracking-wider">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px] font-bold text-gray-400">₹</span>
                <input
                  type="number"
                  value={quickActionAmount}
                  onChange={(e) => setQuickActionAmount(e.target.value)}
                  className="w-full h-16 pl-9 pr-4 rounded-xl text-[24px] font-black outline-none border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] bg-[#F5F7F8] dark:bg-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-colors"
                  placeholder="0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && quickActionName && quickActionAmount) {
                      e.currentTarget.blur();
                      const finalIntent = activeQuickAction.prompt
                        .replace("{target}", quickActionName)
                        .replace("{amount}", quickActionAmount);
                      setSheetMode(null);
                      setTimeout(() => handleSubmit(finalIntent), 200);
                    }
                  }}
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (!quickActionName || !quickActionAmount) return;
                let finalIntent = activeQuickAction.prompt
                  .replace("{target}", quickActionName)
                  .replace("{amount}", quickActionAmount);

                if (quickActionUpiId.trim()) {
                  finalIntent += ` to ${quickActionUpiId.trim()}`;
                }

                setSheetMode(null);
                setTimeout(() => handleSubmit(finalIntent), 200);
              }}
              disabled={!quickActionName || !quickActionAmount}
              className="w-full py-4 mt-6 bg-[#00B9F1] text-white text-[15px] font-black rounded-xl shadow-lg shadow-[#00B9F1]/20 transition-transform active:scale-95 disabled:opacity-50 disabled:shadow-none"
            >
              Confirm and Proceed
            </button>
          </div>
        )}

        {sheetMode === "history" && (
          <div className="flex flex-col gap-4 py-2 px-1">
            <div className="bg-[#F5F7F8] dark:bg-[#1A1A1A] p-6 rounded-[24px] border border-gray-100 dark:border-gray-800 transition-colors">
              <p className="text-[13px] text-gray-500 dark:text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Linked Bank Account</p>
              <h2 className="text-[32px] font-extrabold text-gray-900 dark:text-white">₹{bankBalance.toLocaleString("en-IN")}</h2>
              {negativeBalance > 0 && <p className="text-red-500 text-[13px] mt-1.5 font-bold tracking-wide">Edge Dues: -₹{negativeBalance}</p>}
              {/* Trust Score Bar */}
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Edge-Score</span>
                  <span className="text-[12px] font-bold" style={{ color: trustColor }}>{edgeScore}/100 — {trustTier}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${edgeScore}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: trustColor }}
                  />
                </div>
              </div>
            </div>

            <h3 className="text-[13px] font-bold text-gray-400 mt-4 px-2 uppercase tracking-wider">Payment History</h3>
            <div className="flex flex-col gap-2.5 max-h-[45vh] overflow-y-auto pr-1 pb-10 scrollbar-hide">
              {transactions.map(tx => (
                <div key={tx.id} className="flex justify-between items-center bg-white dark:bg-[#1A1A1A] p-4 rounded-[20px] border border-gray-100 dark:border-gray-800 shadow-sm dark:shadow-none transition-colors">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center ${tx.type === 'credit' ? 'bg-green-500/10 dark:bg-green-500/20' : 'bg-[#00B9F1]/10 dark:bg-blue-500/20'}`}>
                      {tx.type === "credit" ? <Landmark size={20} className="text-green-600 dark:text-green-500" /> : <Scan size={20} className="text-[#00B9F1]" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight mb-0.5">{tx.title}</span>
                      <span className="text-[12px] text-gray-500 dark:text-gray-400">{tx.target} • {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-[16px] font-extrabold ${tx.type === 'credit' ? 'text-green-600 dark:text-green-500' : 'text-gray-900 dark:text-white'}`}>
                      {tx.type === 'credit' ? '+' : '-'}₹{(tx.amount || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && <div className="text-center text-xs text-gray-500 py-6">No recent transactions.</div>}
            </div>
          </div>
        )}

        {sheetMode === "profile" && (
          <div className="flex flex-col gap-4 py-2 px-1">
            <div className="flex flex-col items-center justify-center py-4 border-b border-gray-100 dark:border-gray-800 transition-colors">
              <div className="w-24 h-24 mb-3 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 bg-gray-100 shadow-sm transition-colors">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=e2e8f0" alt="Profile" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-[20px] font-bold text-gray-900 dark:text-white mb-0.5">Avinash Kumar</h2>
              <p className="text-[14px] text-gray-500 dark:text-gray-400 mb-2">9123456789@paytm</p>
              <TrustScoreBadge
                isBlocked={isAccountBlocked}
                edgeScore={edgeScore}
                edgeLimit={availableLimit}
                balanceDrain={balanceDrain}
                trustTier={trustTier}
                trustColor={trustColor}
                gruRisk={gruRiskDisplay}
                elapsedHours={offlineStartTime ? (Date.now() - offlineStartTime) / 3600000 : 0}
                isColdStart={isColdStart}
              />
            </div>

            <div className="flex flex-col gap-2.5 mt-2">
              <h3 className="text-[12px] font-bold text-gray-400 px-1 uppercase tracking-wider">Account Insights</h3>
              <div className="bg-[#F5F7F8] dark:bg-[#1A1A1A] p-4 rounded-2xl flex items-center justify-between border border-gray-100 dark:border-gray-800 transition-colors">
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-gray-800 dark:text-white">Edge-Score</span>
                  <span className="text-[12px] text-gray-500 dark:text-gray-400">AI Trust Engine ({trustPoints} TP)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${edgeScore}%`, background: trustColor }} />
                  </div>
                  <span className="font-extrabold text-[14px]" style={{ color: trustColor }}>{edgeScore}</span>
                </div>
              </div>
              <div className="bg-[#F5F7F8] dark:bg-[#1A1A1A] p-4 rounded-2xl flex items-center justify-between border border-gray-100 dark:border-gray-800 transition-colors">
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-gray-800 dark:text-white">Linked Bank</span>
                  <span className="text-[12px] text-gray-500 dark:text-gray-400">SBI •••• 1234</span>
                </div>
                < Landmark size={20} className="text-[#00B9F1]" />
              </div>
            </div>

            <div className="flex flex-col gap-2.5 mt-4">
              <h3 className="text-[12px] font-bold text-gray-400 px-1 uppercase tracking-wider flex items-center gap-1.5"><Sparkles size={14} className="text-[#00B9F1]" /> AI Settings Playground</h3>
              <div className="bg-white dark:bg-[#1A1A1A] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 transition-colors shadow-sm dark:shadow-none">
                <p className="text-[12px] text-gray-500 mb-3 leading-snug">Generate fake transaction histories to test the EdgePay limits:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => applyPersona('veteran')} className="py-2.5 px-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-bold text-[12px] rounded-xl active:scale-95 transition-transform border border-green-200 dark:border-green-800/50">
                    Trusted Veteran
                  </button>
                  <button onClick={() => applyPersona('scammer')} className="py-2.5 px-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-bold text-[12px] rounded-xl active:scale-95 transition-transform border border-red-200 dark:border-red-800/50">
                    Bust-out Scammer
                  </button>
                  <button onClick={() => applyPersona('student')} className="py-2.5 px-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-bold text-[12px] rounded-xl active:scale-95 transition-transform border border-blue-200 dark:border-blue-800/50">
                    College Student
                  </button>
                  <button onClick={() => applyPersona('merchant')} className="py-2.5 px-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 font-bold text-[12px] rounded-xl active:scale-95 transition-transform border border-purple-200 dark:border-purple-800/50">
                    Regular Merchant
                  </button>
                  <button onClick={() => applyPersona('fresh')} className="py-2.5 px-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-[12px] rounded-xl active:scale-95 transition-transform col-span-2 border border-gray-200 dark:border-gray-700">
                    Fresh User (Cold Start &lt; 10 txs)
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-[#1A1A1A] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 transition-colors shadow-sm dark:shadow-none mt-2">
                <h4 className="text-[12px] font-bold text-gray-800 dark:text-white mb-2 tracking-wide uppercase">FastAPI Network Details</h4>
                <p className="text-[11px] text-gray-500 mb-2 leading-snug">Connect physical phones by entering your computer's local WiFi IP (e.g., http://192.168.1.100:8000).</p>
                <input 
                  type="text"
                  value={backendUrl}
                  onChange={(e) => {
                    setBackendUrl(e.target.value);
                    localStorage.setItem('paytm_backend_url', e.target.value);
                  }}
                  placeholder="Backend URL (http://ip:8000)"
                  className="w-full bg-[#F5F7F8] dark:bg-[#0A0A0A] px-3 py-2.5 rounded-xl text-[13px] font-mono border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5 mt-4">
              <h3 className="text-[12px] font-bold text-gray-400 px-1 uppercase tracking-wider">Settings</h3>

              {/* Theme Toggle */}
              <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm dark:shadow-none transition-colors">
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-full flex items-center justify-between p-4 active:bg-gray-50 dark:active:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${theme === 'dark' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-600/10 text-blue-600'}`}>
                      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-[14px] font-bold text-gray-800 dark:text-white">Theme Preference</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                    </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-[#00B9F1]' : 'bg-gray-200'}`}>
                    <motion.div
                      animate={{ x: theme === 'dark' ? 26 : 2 }}
                      className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm"
                    />
                  </div>
                </button>

                <div className="mx-4 h-[1px] bg-gray-50 dark:bg-gray-800" />

                <button className="w-full flex items-center justify-between p-4 active:bg-gray-50 dark:active:bg-gray-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400">
                      <Settings size={18} />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-[14px] font-bold text-gray-800 dark:text-white">App Settings</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">Security, Language, and Preferences</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        )}

        {sheetMode === 'notifications' && (
          <div className="flex flex-col gap-3 py-2 px-1 max-h-[65vh] overflow-y-auto scrollbar-hide">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center transition-colors">
                  <Bell size={32} className="text-gray-300 dark:text-gray-700" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-[15px] font-bold">No notifications yet</p>
                <p className="text-gray-400 dark:text-gray-500 text-[12px] text-center max-w-[200px]">Actions like payments and sync events will appear here</p>
              </div>
            ) : (
              notifications.map((n: any) => (
                <div key={n.id} className="flex gap-4 bg-[#F5F7F8] dark:bg-[#1A1A1A] p-4 rounded-xl border border-gray-100 dark:border-gray-800 items-start transition-colors">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${n.icon === 'zap' ? 'bg-[#00B9F1]/10 dark:bg-[#00B9F1]/20' : n.icon === 'shield' ? 'bg-green-500/10 dark:bg-green-500/20' : 'bg-red-500/10 dark:bg-red-500/20'}`}>
                    {n.icon === 'zap' ? <Zap size={18} className="text-[#00B9F1]" /> : n.icon === 'shield' ? <ShieldCheck size={18} className="text-green-600 dark:text-green-500" /> : <AlertCircle size={18} className="text-red-500" />}
                  </div>
                  <div className="flex flex-col flex-1">
                    <span className="text-[14px] font-bold text-gray-900 dark:text-white mb-0.5">{n.title}</span>
                    <span className="text-[12px] text-gray-500 dark:text-gray-400 mb-1 leading-snug">{n.desc}</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{new Date(n.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            )}
            {notifications.length > 0 && (
              <button onClick={() => { setNotifications([]); localStorage.removeItem('paytm_notifications'); }} className="w-full py-3 text-[12px] font-bold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-800 rounded-xl mt-2 active:scale-95 transition-transform bg-white dark:bg-transparent">
                Clear All Notifications
              </button>
            )}
          </div>
        )}

        {sheetMode === "repay" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex p-1 rounded-xl bg-gray-100 dark:bg-gray-800/80 transition-colors">
              <button
                onClick={() => setRepayMode("full")}
                className={`flex-1 py-2.5 text-[13px] font-bold rounded-lg transition-all ${repayMode === "full" ? "bg-white shadow-sm text-[#002970] dark:bg-gray-700 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              >
                Pay Full (₹{pendingDues})
              </button>
              <button
                onClick={() => setRepayMode("custom")}
                className={`flex-1 py-2.5 text-[13px] font-bold rounded-lg transition-all ${repayMode === "custom" ? "bg-white shadow-sm text-[#002970] dark:bg-gray-700 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              >
                Custom Amount
              </button>
            </div>

            {repayMode === "custom" && (
              <div className="relative mt-2">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[20px] font-bold text-gray-400 transition-colors">₹</span>
                <input
                  type="number"
                  value={customRepayAmount}
                  onChange={(e) => setCustomRepayAmount(e.target.value)}
                  className="w-full h-16 pl-12 pr-4 rounded-2xl text-[22px] font-black outline-none border border-gray-200 dark:border-gray-800 focus:border-[#00B9F1] dark:focus:border-[#00B9F1] bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors"
                  placeholder="0"
                />
              </div>
            )}
            {repayMode === "custom" && Number(customRepayAmount) > pendingDues && (
              <p className="text-red-500 text-[12px] font-bold mt-1 px-1">Cannot pay more than pending dues (₹{pendingDues})</p>
            )}

            <div className="mt-4">
              <SwipeToConfirm
                label={
                  repayMode === "full"
                    ? `Swipe to Clear ₹${pendingDues}`
                    : `Swipe to Pay ₹${Number(customRepayAmount) || "0"}`
                }
                onConfirm={() => {
                  if (repayMode === "full") {
                    setPendingOfflineTransactions([]);
                    setNegativeBalance(0);
                  } else {
                    const amt = Number(customRepayAmount);
                    if (amt > 0 && amt <= pendingDues) {
                      setPendingOfflineTransactions(prev => [
                        ...prev,
                        { id: `repay-${Date.now()}`, type: "repay", title: "Partial Manual Repayment", target: "Bank", amount: -amt, icon: "card" }
                      ]);
                      setNegativeBalance(prev => Math.max(0, prev - Math.abs(amt)));
                      setBankBalance(p => p - amt);
                      setTransactions(prev => [{ id: `rp-${Date.now()}`, date: Date.now(), title: "Repaid Edge Dues", target: "Guarantor Queue", amount: amt, type: "debit" }, ...prev]);
                    }
                  }
                  setTimeout(() => {
                    setSheetMode(null);
                    setCustomRepayAmount("");
                    setRepayMode("full");
                  }, 1200);
                }}
              />
            </div>
          </div>
        )}

        {sheetMode === "intent" && (
          paymentStatus === "success" && isOnline ? (
            <div className="flex flex-col items-center py-10 px-4 text-center animate-in zoom-in duration-300">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}
                className="w-[72px] h-[72px] bg-[#00B9F1] rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(0,185,241,0.5)]"
              >
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <h2 className="text-[32px] font-black text-gray-900 dark:text-white mb-2">{totalLabel}</h2>
              <p className="text-[15px] text-gray-500 dark:text-gray-400 mb-8 max-w-[240px] leading-relaxed">
                Paid Successfully to <br /><span className="font-extrabold text-gray-900 dark:text-white text-[17px]">{actionPlan?.actions[0]?.target || "Merchant"}</span>
              </p>
              <button onClick={() => { setSheetMode(null); setPaymentStatus("idle"); setInputValue(""); }} className="w-full py-4 bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-[20px] font-bold text-[#00B9F1] active:scale-95 transition-all">
                Done
              </button>
            </div>
          ) : showSoundbox ? (
            <div className="pb-2">
              <BleSoundboxSim
                amount={total}
                target={actionPlan?.actions[0]?.target || "Merchant"}
                merchantId={actionPlan?.actions[0]?.upiId || actionPlan?.actions[0]?.target || "merchant"}
                onComplete={(success, tokenId) => {
                  if (tokenId) {
                    setLastTxMeta(prev => prev ? { ...prev, tokenId } : prev);
                  }
                  setShowSoundbox(false);
                  setShowReceipt(true);
                }}
              />
            </div>
          ) : showReceipt && lastTxMeta ? (
            <div className="pb-4">
              <ReceiverReceiptSlip
                amount={lastTxMeta.amount}
                target={lastTxMeta.target}
                tokenId={lastTxMeta.tokenId}
                timestamp={lastTxMeta.ts}
              />
              <button onClick={() => { setSheetMode(null); setShowReceipt(false); setPaymentStatus("idle"); }} className="w-full mt-6 py-4 bg-gray-100 dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-[20px] font-bold text-[#00B9F1] active:scale-95 transition-all text-[15px]">
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 rounded-2xl mb-1 mt-1 bg-gray-100 dark:bg-gray-800 border-none">
                <p className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
                  <span className="text-[#00B9F1] mr-1">✦</span>
                  <span className="font-bold text-gray-900 dark:text-white">&ldquo;{inputValue}&rdquo;</span>
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {actionPlan?.actions?.map((action, i) => (
                  <ActionReceiptCard
                    key={action.id}
                    title={action.title}
                    subtitle={action.target}
                    upiId={action.upiId}
                    amount={`₹${action.amount.toLocaleString("en-IN")}`}
                    iconName={ICON_MAP[action.icon] ?? "card"}
                    index={i}
                    isEdgePay={!isOnline}
                    availableLimit={availableLimit}
                  />
                ))}
              </div>

              {actionPlan && (
                <div className="flex items-center justify-between px-3 py-4 mt-3 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-[14px] font-medium text-gray-500 dark:text-gray-400">Total Settlement</span>
                  <span className="text-[22px] font-extrabold text-gray-900 dark:text-white">{totalLabel}</span>
                </div>
              )}

              <div className="mt-2 text-black relative">
                <SwipeToConfirm
                  label={`Swipe to Pay ${totalLabel}`}
                  onConfirm={handleConfirm}
                />
                {paymentStatus === "processing" && (
                  <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 rounded-full flex items-center justify-center z-10 backdrop-blur-sm">
                    <Loader2 size={24} className="animate-spin text-[#00B9F1]" />
                  </div>
                )}
              </div>
            </>
          )
        )}

        {sheetMode === "receiveQR" && (
          <ReceiveOfflineQR 
            upiId="9123456789@paytm" 
            bleDeviceId={`EDGE-${Math.floor(Math.random() * 10000)}`} 
            onClose={() => setSheetMode(null)} 
          />
        )}

        {sheetMode === "scanQR" && (
          <OfflineScannerSim 
            onScan={(upi, ble) => {
              setSheetMode(null);
              // Auto-fill an offline intent
              setTimeout(() => handleSubmit(`Pay ${upi}`), 200);
            }} 
            onCancel={() => setSheetMode(null)} 
          />
        )}
      </BottomSheetContainer>

      {/* ── Modal Overlays ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSplitCard && splitMeta && (
          <InteractiveSplitCard
            title={splitMeta.title}
            totalAmount={splitMeta.totalAmount}
            targetCount={splitMeta.targetCount}
            onClose={() => {
              setShowSplitCard(false);
              setSplitMeta(null);
              setInputValue("");
            }}
            onConfirm={(contacts, perPerson) => {
              const totalAmt = splitMeta.totalAmount;
              setBankBalance(prev => prev - totalAmt);
              setTransactions(prev => [
                {
                  id: `split-${Date.now()}`,
                  date: Date.now(),
                  title: `Split: ${splitMeta.title}`,
                  target: `${contacts.length} Friends`,
                  amount: totalAmt,
                  type: 'debit'
                },
                ...prev
              ]);
              pushNotification(
                'Split Requests Sent',
                `Requested ₹${perPerson} from ${contacts.length} people.`,
                'zap'
              );
            }}
          />
        )}

        {showSuccessScreen && successMeta && (
          <PaytmSuccessScreen
            amount={successMeta.amount}
            target={successMeta.target}
            upiId={successMeta.upiId}
            onClose={() => {
              setShowSuccessScreen(false);
              setSuccessMeta(null);
              setInputValue("");
            }}
          />
        )}

        {showInvalidCard && invalidMeta && (
          <InvalidPromptCard
            errorMessage={invalidMeta.message}
            originalPrompt={invalidMeta.prompt}
            onClose={() => {
              setShowInvalidCard(false);
              setInvalidMeta(null);
              setInputValue("");
            }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
