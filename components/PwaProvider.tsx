"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

type PwaContextValue = {
  isInstallable: boolean;
  install: () => Promise<boolean>;
};

const PwaContext = createContext<PwaContextValue>({
  isInstallable: false,
  install: async () => false,
});

export function usePwa() {
  return useContext(PwaContext);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    // Skip service-worker registration during local dev to avoid stale cache.
    if (process.env.NODE_ENV === "development") return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Optional: warn about waiting updates.
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (installing) {
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                console.log("[PWA] New version available; reload to update.");
              }
            });
          }
        });
      })
      .catch((err) => {
        console.error("[PWA] Service worker registration failed:", err);
      });
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  };

  return (
    <PwaContext.Provider
      value={{ isInstallable: deferredPrompt !== null, install }}
    >
      {children}
    </PwaContext.Provider>
  );
}
