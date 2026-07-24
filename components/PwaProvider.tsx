"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type PwaPlatform = "ios" | "android" | "desktop" | "other";

type PwaContextValue = {
  canInstallNatively: boolean;
  isInstalled: boolean;
  platform: PwaPlatform;
  canInstall: boolean;
  install: () => Promise<boolean>;
  notificationsSupported: boolean;
  notificationsEnabled: boolean;
  enableNotifications: () => Promise<boolean>;
  isUpdateAvailable: boolean;
  /** The SW was just activated (a fresh version took over after a reload). */
  justUpdated: boolean;
};

const PwaContext = createContext<PwaContextValue>({
  canInstallNatively: false,
  isInstalled: false,
  platform: "other",
  canInstall: false,
  install: async () => false,
  notificationsSupported: false,
  notificationsEnabled: false,
  enableNotifications: async () => false,
  isUpdateAvailable: false,
  justUpdated: false,
});

export function usePwa() {
  return useContext(PwaContext);
}

function detectPlatform(ua: string): PwaPlatform {
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
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<PwaPlatform>("other");
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const justUpdatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notificationsSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  useEffect(() => {
    if (typeof window === "undefined") return;

    setPlatform(detectPlatform(window.navigator.userAgent));
    setIsInstalled(detectStandalone());
    setNotificationsEnabled(
      typeof Notification !== "undefined" &&
        Notification.permission === "granted"
    );

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

  /* ── Service‑worker lifecycle ───────────────────────────────── */
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    if (process.env.NODE_ENV === "development") return;

    const scheduleJustUpdatedReset = () => {
      if (justUpdatedTimerRef.current) clearTimeout(justUpdatedTimerRef.current);
      justUpdatedTimerRef.current = setTimeout(() => setJustUpdated(false), 4_000);
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Check if a waiting SW already exists (e.g. from a previous visit).
        if (registration.waiting) {
          setIsUpdateAvailable(true);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            switch (installing.state) {
              case "installed":
                if (navigator.serviceWorker.controller) {
                  // New version is waiting — show the update banner.
                  setIsUpdateAvailable(true);
                }
                break;
              case "activated":
                // The new SW just took over.
                setJustUpdated(true);
                setIsUpdateAvailable(false);
                scheduleJustUpdatedReset();
                break;
            }
          });
        });

        // Listen for activation messages from the SW (posted when it takes
        // over in a different tab).
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "SW_UPDATED") {
            setJustUpdated(true);
            setIsUpdateAvailable(false);
            scheduleJustUpdatedReset();
          }
        });
      })
      .catch((err) => {
        console.error("[PWA] Service worker registration failed:", err);
      });

    return () => {
      if (justUpdatedTimerRef.current) clearTimeout(justUpdatedTimerRef.current);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  }, [deferredPrompt]);

  const enableNotifications = useCallback(async () => {
    if (!notificationsSupported) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return false;
      setNotificationsEnabled(true);

      // Subscribe to push via the service worker.
      const reg = await navigator.serviceWorker.ready;

      // Check for an existing subscription to avoid duplicates.
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await sendSubscriptionToServer(existing);
        return true;
      }

      // Fetch the VAPID public key from the server.
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) return true; // notifications work locally even without push
      const { publicKey } = await keyRes.json();
      if (!publicKey) return true;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      await sendSubscriptionToServer(sub);
      return true;
    } catch (err) {
      console.error("[PWA] Failed to enable notifications:", err);
      return false;
    }
  }, [notificationsSupported]);

  const canInstallNatively = deferredPrompt !== null;
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
        notificationsSupported,
        notificationsEnabled,
        enableNotifications,
        isUpdateAvailable,
        justUpdated,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

async function sendSubscriptionToServer(
  sub: PushSubscription
): Promise<void> {
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  }).catch(() => {});
}
