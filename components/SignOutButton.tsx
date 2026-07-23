"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      onClick={async () => {
        setLoading(true);
        setFailed(false);
        try {
          const res = await fetch("/api/auth/signout", { method: "POST" });
          if (!res.ok) throw new Error("Sign out failed");
          router.push("/auth");
          router.refresh();
        } catch {
          setFailed(true);
        } finally {
          setLoading(false);
        }
      }}
      disabled={loading}
      className={
        compact
          ? "rounded-lg border border-zinc-700/50 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-600 disabled:opacity-50 transition-all duration-200"
          : "rounded-xl border border-zinc-700/50 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-600 disabled:opacity-50 transition-all duration-200"
      }
    >
      {loading ? "..." : failed ? "Try again" : "Sign out"}
    </button>
  );
}

export default SignOutButton;
