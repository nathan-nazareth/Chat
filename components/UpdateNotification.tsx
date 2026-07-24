"use client";

import { useEffect, useState } from "react";
import { usePwa } from "@/components/PwaProvider";

/**
 * Shows a banner when a new service worker version is waiting to activate,
 * and a brief "Updated!" toast after an update has been applied.
 *
 * The actual SW-update detection lives in PwaProvider (via `updatefound` /
 * `statechange` events on the installing worker).  This component just reads
 * the context flags and renders the appropriate UI.
 */
export function UpdateNotification() {
  const { isUpdateAvailable, justUpdated } = usePwa();
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when a new update becomes available.
  useEffect(() => {
    if (isUpdateAvailable) setDismissed(false);
  }, [isUpdateAvailable]);

  /* ── Update-available banner ──────────────────────────────── */
  if (isUpdateAvailable && !dismissed) {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] px-4 pt-3 pointer-events-none animate-slide-down">
        <div className="mx-auto max-w-md pointer-events-auto rounded-xl border border-accent/30 bg-surface-raised backdrop-blur-xl shadow-elevated px-4 py-3 flex items-center gap-3">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-accent/15 grid place-items-center">
            <svg
              className="w-4 h-4 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100">
              Update available
            </p>
            <p className="text-xs text-zinc-500">
              A new version of Chat is ready.
            </p>
          </div>
          <button
            onClick={() => {
              // Ask the waiting SW to skip waiting, then reload.
              navigator.serviceWorker?.ready
                .then((reg) => {
                  if (reg.waiting) {
                    reg.waiting.postMessage({ type: "SKIP_WAITING" });
                  }
                })
                .catch(() => {});
              window.location.reload();
            }}
            type="button"
            className="shrink-0 rounded-lg bg-accent hover:bg-accent-hover px-3 py-2 text-xs font-medium text-white shadow-glow transition-all duration-200 active:scale-95"
          >
            Reload
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 grid place-items-center w-7 h-7 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
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
    );
  }

  /* ── Just-updated toast ───────────────────────────────────── */
  if (justUpdated) {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] px-4 pt-3 pointer-events-none animate-slide-down">
        <div className="mx-auto max-w-md pointer-events-auto rounded-xl border border-emerald-500/30 bg-surface-raised backdrop-blur-xl shadow-elevated px-4 py-3 flex items-center gap-3">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/15 grid place-items-center">
            <svg
              className="w-4 h-4 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-100">App updated</p>
        </div>
      </div>
    );
  }

  return null;
}
