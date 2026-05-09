"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SPLASH_SESSION_KEY = "pnut_splash_shown";

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Only show splash once per session
    const alreadyShown = sessionStorage.getItem(SPLASH_SESSION_KEY);
    if (!alreadyShown) {
      setShowSplash(true);
      sessionStorage.setItem(SPLASH_SESSION_KEY, "true");

      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, []);

  // During SSR or before hydration, render children immediately
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-brand-cream"
          >
            {/* Logo / Brand text */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.1,
              }}
              className="flex flex-col items-center"
            >
              <h1 className="font-[family-name:var(--font-heading)] text-5xl font-bold text-brand-black tracking-tight">
                PNUT{" "}
                <span className="text-brand-yellow">MONSTER</span>
              </h1>
            </motion.div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-4 font-[family-name:var(--font-body)] text-base text-brand-gray-500"
            >
              Healthy never tasted this fun!
            </motion.p>

            {/* Loading dots */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-10 flex gap-2"
            >
              <span className="h-2 w-2 rounded-full bg-brand-yellow animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-brand-yellow animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-brand-yellow animate-bounce [animation-delay:300ms]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </>
  );
}
