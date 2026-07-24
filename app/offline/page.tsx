"use client";

export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/15 to-purple-500/15 border border-accent/15 grid place-items-center mb-6">
        <svg
          className="w-10 h-10 text-accent/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold text-zinc-100">You&apos;re offline</h1>
      <p className="text-sm text-zinc-400 mt-2 max-w-xs leading-relaxed">
        Chat needs an internet connection right now. We&apos;ll reconnect you when
        you&apos;re back online.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 rounded-xl bg-accent hover:bg-accent-hover px-6 py-2.5 text-sm font-medium text-white shadow-glow hover:shadow-glow-lg transition-all duration-200 active:scale-[0.98]"
        type="button"
      >
        Retry
      </button>
    </main>
  );
}
