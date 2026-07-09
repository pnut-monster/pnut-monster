"use client";

import { useEffect } from "react";

const RESET_SESSION_KEY = "pnut-dev-sw-reset";

export function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = "caches" in window ? await caches.keys() : [];

      await Promise.all([
        ...registrations.map((registration) => registration.unregister()),
        ...cacheKeys.map((key) => caches.delete(key)),
      ]);

      if (
        (registrations.length > 0 || cacheKeys.length > 0) &&
        window.sessionStorage.getItem(RESET_SESSION_KEY) !== "true"
      ) {
        window.sessionStorage.setItem(RESET_SESSION_KEY, "true");
        window.location.reload();
      }
    })();
  }, []);

  return null;
}
