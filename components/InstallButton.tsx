"use client";

import { useEffect, useState } from "react";
import { usePwa } from "@/components/PwaProvider";
import { IosInstallModal } from "@/components/IosInstallModal";

export function InstallButton({
  variant = "icon",
  className = "",
}: {
  variant?: "icon" | "button";
  className?: string;
}) {
  const { canInstallNatively, isInstalled, platform, install } = usePwa();
  const [showIosModal, setShowIosModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid SSR/hydration mismatch — platform detection is client-only.
  if (!mounted) return null;

  // Already running as an installed PWA.
  if (isInstalled) return null;

  const hasNativePrompt = canInstallNatively;
  const isIos = platform === "ios";

  if (!hasNativePrompt && !isIos) return null;

  async function handleClick() {
    if (hasNativePrompt) {
      await install();
    } else if (isIos) {
      setShowIosModal(true);
    }
  }

  const downloadIcon = (
    <svg
      className={variant === "icon" ? "w-5 h-5" : "w-4 h-4"}
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
  );

  if (variant === "button") {
    return (
      <>
        <button
          onClick={() => void handleClick()}
          type="button"
          className={`inline-flex items-center justify-center gap-2 rounded-xl bg-accent hover:bg-accent-hover px-4 py-2.5 text-sm font-medium text-white shadow-glow hover:shadow-glow-lg transition-all duration-200 active:scale-[0.98] ${className}`}
        >
          {downloadIcon}
          Install app
        </button>
        {showIosModal && <IosInstallModal onClose={() => setShowIosModal(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => void handleClick()}
        aria-label="Install app"
        title="Install app"
        className={`grid place-items-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors tap-transparent ${className}`}
        type="button"
      >
        {downloadIcon}
      </button>
      {showIosModal && <IosInstallModal onClose={() => setShowIosModal(false)} />}
    </>
  );
}
