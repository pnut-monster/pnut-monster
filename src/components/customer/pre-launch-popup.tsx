"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Bell, CheckCircle2, Sparkles } from "lucide-react";

interface PreLaunchPopupProps {
  open: boolean;
  onClose: () => void;
  launchDate: Date | null;
}

function useCountdown(target: Date | null) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!target) return;
    const tick = () => {
      const now = new Date().getTime();
      const diff = Math.max(0, target.getTime() - now);
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return timeLeft;
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-14 h-14 rounded-xl bg-brand-black flex items-center justify-center">
        <span className="font-[family-name:var(--font-heading)] text-brand-yellow text-xl font-bold">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="text-[10px] text-brand-gray-500 mt-1 uppercase tracking-wide">{label}</span>
    </div>
  );
}

export function PreLaunchPopup({ open, onClose, launchDate }: PreLaunchPopupProps) {
  const countdown = useCountdown(launchDate);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/launch/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setSubscribed(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [email]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  const formattedDate = launchDate
    ? launchDate.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden"
          >
            {/* Header gradient */}
            <div className="bg-gradient-to-br from-brand-yellow to-brand-yellow-dark px-6 pt-6 pb-8 text-center relative">
              <button
                onClick={onClose}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/40 transition-colors"
                aria-label="Close"
              >
                <X size={18} className="text-brand-black" />
              </button>
              <div className="w-14 h-14 rounded-full bg-white/30 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-7 h-7 text-brand-black" />
              </div>
              <h2 className="font-[family-name:var(--font-heading)] text-brand-black text-xl font-bold">
                Ordering Starts Soon!
              </h2>
              <p className="text-brand-black/70 text-sm mt-1">
                We&apos;re putting the final touches on something delicious
              </p>
            </div>

            <div className="px-6 pb-6 -mt-4">
              {/* Countdown */}
              <div className="bg-brand-gray-50 rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-brand-gray-500" />
                  <span className="text-xs text-brand-gray-500 font-medium">
                    Countdown to launch
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <CountdownUnit value={countdown.days} label="Days" />
                  <span className="font-bold text-brand-gray-300 text-lg mt-[-12px]">:</span>
                  <CountdownUnit value={countdown.hours} label="Hours" />
                  <span className="font-bold text-brand-gray-300 text-lg mt-[-12px]">:</span>
                  <CountdownUnit value={countdown.minutes} label="Mins" />
                  <span className="font-bold text-brand-gray-300 text-lg mt-[-12px]">:</span>
                  <CountdownUnit value={countdown.seconds} label="Secs" />
                </div>
                {formattedDate && (
                  <p className="text-center text-xs text-brand-gray-500 mt-3">
                    Launching on <span className="font-semibold text-brand-black">{formattedDate}</span>
                  </p>
                )}
              </div>

              {/* Subscribe form */}
              {!subscribed ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="w-4 h-4 text-brand-yellow-dark" />
                    <span className="text-sm font-semibold text-brand-black">Get notified when we launch</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(null); }}
                      placeholder="your@email.com"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-brand-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow transition-all placeholder:text-brand-gray-400"
                      onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
                    />
                    <button
                      onClick={handleSubscribe}
                      disabled={submitting}
                      className="px-4 py-2.5 rounded-xl bg-brand-yellow text-brand-black font-[family-name:var(--font-heading)] font-bold text-sm hover:bg-brand-yellow-dark transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {submitting ? "..." : "Notify Me"}
                    </button>
                  </div>
                  {error && (
                    <p className="text-xs text-brand-red mt-1.5">{error}</p>
                  )}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 bg-brand-green/10 rounded-xl"
                >
                  <CheckCircle2 className="w-5 h-5 text-brand-green flex-shrink-0" />
                  <p className="text-sm text-brand-green-dark font-medium">
                    You&apos;re subscribed! We&apos;ll notify you when ordering goes live.
                  </p>
                </motion.div>
              )}

              {/* Footer message */}
              <p className="text-center text-xs text-brand-gray-400 mt-4">
                Feel free to explore our menu in the meantime!
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
