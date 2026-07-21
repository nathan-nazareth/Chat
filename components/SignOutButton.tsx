"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={async () => {
        setLoading(true);
        await fetch("/api/auth/signout", { method: "POST" });
        router.push("/auth");
        router.refresh();
      }}
      disabled={loading}
      className={
        compact
          ? "rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
          : "rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
      }
    >
      {loading ? "…" : "Sign out"}
    </button>
  );
}

export default SignOutButton;
