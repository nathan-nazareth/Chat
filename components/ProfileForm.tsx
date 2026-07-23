"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProfileForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameValid = username.length >= 3 && /^[a-z0-9_]+$/.test(username);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          const res = await fetch("/api/profile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ displayName, username }),
          });
          const data = await res.json().catch(() => null);
          if (res.status === 401) {
            router.replace("/auth");
            router.refresh();
            return;
          }
          if (!res.ok) throw new Error(data?.error || "Failed to save profile");
          router.push("/");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save profile");
        } finally {
          setLoading(false);
        }
      }}
      className="space-y-5"
    >
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Display name
        </label>
        <input
          required
          autoFocus
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          enterKeyHint="next"
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl bg-zinc-900/80 border border-zinc-700/50 px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
          placeholder="Your name"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Username
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500 select-none">@</span>
          <input
            required
            autoComplete="username"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            minLength={3}
            maxLength={24}
            style={{ fontSize: "16px" }}
            className="w-full rounded-xl bg-zinc-900/80 border border-zinc-700/50 pl-8 pr-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
            placeholder="your_handle"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-zinc-500">
            3-24 characters, lowercase letters, numbers, underscores
          </p>
          {username.length > 0 && (
            <span className={`text-[10px] ${usernameValid ? "text-emerald-400" : "text-zinc-500"}`}>
              {usernameValid
                ? "Looks good"
                : `${Math.max(0, 3 - username.length)} more character${3 - username.length === 1 ? "" : "s"} needed`}
            </span>
          )}
        </div>
      </div>
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !displayName.trim() || !usernameValid}
        className="w-full rounded-xl bg-accent hover:bg-accent-hover text-white font-medium py-3 shadow-glow hover:shadow-glow-lg disabled:opacity-50 disabled:hover:bg-accent disabled:shadow-none transition-all duration-200 active:scale-[0.98]"
      >
        {loading ? "Saving..." : "Continue"}
      </button>
    </form>
  );
}
