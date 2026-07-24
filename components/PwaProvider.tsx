"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type PwaPlatform = "ios" | "android" | "desktop" | "other";

type PwaContextValue = {
  /** Chromium fired `beforeinstallprompt` — we can show the native dialog. */
  canInstallNatively: boolean;
  /** App is already running in standalone / display-mode: standalone. */
  isInstalled: boolean;
  platform: PwaPlatform;
  /** True when there is *some* install path (native prompt OR iOS instructions). */
  canInstall: boolean;
  install: () => Promise<boolean>;
};

const PwaContext = createContext<PwaContextValue>({
  canInstallNatively: false,
  isInstalled: false,
  platform: "other",
  canInstall: false,
  install: async () => false,
});

export function usePwa() {
  return useContext(PwaContext);
}

function detectPlatform(ua: string): PwaPlatform {
  // iPadOS 13+ reports a Macintosh UA but has multi-touch.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && "ontouchend" in document)) {
    return "ios";
  }
  if (/android/i.test(ua)) return "android";
  if (/windows|macintosh|linux/i.test(ua)) return "desktop";
  return "other";
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari uses navigator.standalone
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<PwaPlatform>("other");
  const [isInstalled, setIsInstalled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setPlatform(detectPlatform(window.navigator.userAgent));
    setIsInstalled(detectStandalone());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => setIsInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    setReady(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
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

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  const canInstallNatively = deferredPrompt !== null;

  // There is an install path if the native prompt is available (Chromium),
  // or we're on iOS (where we show manual instructions), and the app is not
  // already installed.
  const canInstall =
    !isInstalled && (canInstallNatively || platform === "ios");

  return (
    <PwaContext.Provider
      value={{
        canInstallNatively,
        isInstalled,
        platform,
        canInstall,
        install,
      }}
    >
      {/* ready flag prevents hydration flash of the button on iOS */}
      {ready || typeof window === "undefined" ? children : children}
    </PwaContext.Provider>
  );
}
