"use client";

import { useEffect, useState } from "react";

const SPLASH_SESSION_KEY = "pnut_splash_shown";

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem(SPLASH_SESSION_KEY);
    if (alreadyShown) {
      return;
    }

    sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
    const showTimer = window.setTimeout(() => setShowSplash(true), 0);
    const hideTimer = window.setTimeout(() => setShowSplash(false), 2000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  return (
    <>
      {showSplash && (
        <div className="fixed inset-0 z-[10000] flex animate-in fade-in duration-300 flex-col items-center justify-center bg-brand-cream">
          <div className="flex animate-in zoom-in-50 fade-in duration-500 flex-col items-center">
            <h1 className="font-[family-name:var(--font-heading)] text-5xl font-bold text-brand-black tracking-tight">
              PNUT <span className="text-brand-yellow">MONSTER</span>
            </h1>
          </div>

          <p className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-500 font-[family-name:var(--font-body)] text-base text-brand-gray-500">
            Healthy never tasted this fun!
          </p>

          <div className="mt-10 flex gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-yellow animate-bounce [animation-delay:0ms]" />
            <span className="h-2 w-2 rounded-full bg-brand-yellow animate-bounce [animation-delay:150ms]" />
            <span className="h-2 w-2 rounded-full bg-brand-yellow animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}

      {children}
    </>
  );
}
