"use client";

import { useEffect, useState } from "react";
import { usePwa } from "@/components/PwaProvider";
import { IosInstallModal } from "@/components/IosInstallModal";

const DISMISS_KEY = "pwa-banner-dismissed";

export function InstallBanner() {
  const { canInstall, canInstallNatively, isInstalled, platform, install } =
    usePwa();
  const [dismissed, setDismissed] = useState(true);
  const [showIosModal, setShowIosModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    let showTimer: ReturnType<typeof setTimeout> | null = null;

    // Check if previously dismissed.
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // localStorage may be blocked — proceed as if not dismissed.
    }

    // Delay the banner so it doesn't appear instantly on page load.
    showTimer = setTimeout(() => setDismissed(false), 3500);

    return () => {
      if (showTimer) clearTimeout(showTimer);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!mounted || dismissed || isInstalled || !canInstall) return null;

  const isIos = platform === "ios";

  async function handleInstall() {
    if (canInstallNatively) {
      const accepted = await install();
      if (accepted) dismiss();
    } else if (isIos) {
      setShowIosModal(true);
    }
  }

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pointer-events-none animate-slide-up">
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-zinc-700/60 bg-surface-raised backdrop-blur-xl shadow-elevated p-4 flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-purple-500 grid place-items-center shadow-glow">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100">Install Chat</p>
            <p className="text-xs text-zinc-500 truncate">
              {isIos
                ? "Add to your home screen"
                : "Faster access, works offline"}
            </p>
          </div>
          <button
            onClick={() => void handleInstall()}
            type="button"
            className="shrink-0 rounded-lg bg-accent hover:bg-accent-hover px-3 py-2 text-xs font-medium text-white shadow-glow transition-all duration-200 active:scale-95"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
      {showIosModal && <IosInstallModal onClose={() => setShowIosModal(false)} />}
    </>
  );
}
