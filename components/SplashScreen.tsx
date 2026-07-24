"use client";

import { useEffect, useState } from "react";

/**
 * Shows a brief splash/loading screen on first mount when the app is running
 * in standalone (installed PWA) mode.  Fades out once the client has hydrated
 * and the first paint is done.
 *
 * Guarded by a `sessionStorage` flag so it only plays *once* per browser
 * session (not on every navigation within the SPA).
 */
export function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Only show splash when launched from the home screen.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;

    if (!isStandalone) {
      setVisible(false);
      return;
    }

    // Don't replay on subsequent soft navigations.
    try {
      if (sessionStorage.getItem("pwa-splash-shown")) {
        setVisible(false);
        return;
      }
      sessionStorage.setItem("pwa-splash-shown", "1");
    } catch {
      // sessionStorage may be restricted — proceed without guard.
    }

    // Wait one tick after hydration so the main UI is ready, then fade out.
    const timer = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-surface-base animate-fade-in">
      <div className="flex flex-col items-center gap-5">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-purple-500 grid place-items-center shadow-glow-lg">
          <svg
            className="w-9 h-9 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
            />
          </svg>
        </div>

        {/* Animated dots */}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
