"use client";

import { usePwa } from "@/components/PwaProvider";

export function InstallButton() {
  const { isInstallable, install } = usePwa();

  if (!isInstallable) return null;

  return (
    <button
      onClick={() => void install()}
      aria-label="Install app"
      title="Install app"
      className="grid place-items-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors tap-transparent"
      type="button"
    >
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
          d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25"
        />
      </svg>
    </button>
  );
}
