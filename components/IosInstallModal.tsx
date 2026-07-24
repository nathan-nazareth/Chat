"use client";

import { useEffect } from "react";

export function IosInstallModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-700/60 bg-surface-raised backdrop-blur-xl shadow-elevated p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Install Chat</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            <svg
              className="w-5 h-5"
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

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-zinc-800/60 grid place-items-center text-zinc-300">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 11l5-5m0 0l5 5m-5-5v12"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Tap the Share button
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                It&apos;s in the toolbar at the bottom of the screen.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-zinc-800/60 grid place-items-center text-zinc-300">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Select &ldquo;Add to Home Screen&rdquo;
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Scroll down the share sheet and tap this option.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-zinc-800/60 grid place-items-center text-zinc-300">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Tap &ldquo;Add&rdquo;
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Chat will appear on your home screen like a native app.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-accent hover:bg-accent-hover text-white font-medium py-2.5 text-sm shadow-glow transition-all duration-200 active:scale-[0.98]"
          type="button"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
