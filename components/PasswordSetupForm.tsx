"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordSetupForm({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/signup-password", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error || "Failed to set password");
          // The signup-password route already saved the session with
          // profileCompleted=false; we just need to land on /profile to set
          // the display name + username next.
          router.replace("/profile");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to set password");
        } finally {
          setLoading(false);
        }
      }}
      className="space-y-4 animate-fade-in"
    >
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Password
        </label>
        <p className="text-xs text-zinc-400 mb-3">
          For <span className="text-zinc-200 font-medium">{email}</span> (8+ characters)
        </p>
        <input
          type="password"
          required
          autoFocus
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl bg-zinc-900/80 border border-zinc-700/50 px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
          placeholder="Minimum 8 characters"
        />
      </div>
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={loading || password.length < 8}
        className="w-full rounded-xl bg-accent hover:bg-accent-hover text-white font-medium py-3 shadow-glow hover:shadow-glow-lg disabled:opacity-50 disabled:hover:bg-accent disabled:shadow-none transition-all duration-200 active:scale-[0.98]"
      >
        {loading ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
