"use client";

import { useEffect, useState } from "react";
import { usePwa } from "@/components/PwaProvider";

export function NotificationButton() {
  const { notificationsSupported, notificationsEnabled, enableNotifications } =
    usePwa();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted || !notificationsSupported) return null;
  if (notificationsEnabled) return null;

  async function handleClick() {
    setBusy(true);
    await enableNotifications();
    setBusy(false);
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={busy}
      aria-label="Enable notifications"
      title="Enable notifications"
      className="grid place-items-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors tap-transparent"
      type="button"
    >
      {busy ? (
        <div className="w-4 h-4 border-2 border-zinc-600/30 border-t-zinc-400 rounded-full animate-spin" />
      ) : (
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
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
      )}
    </button>
  );
}
