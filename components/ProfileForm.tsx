"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProfileForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName, username }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed");
          setLoading(false);
          return;
        }
        router.push("/");
        router.refresh();
      }}
      className="space-y-3"
    >
      <label className="block text-sm text-zinc-300">
        Name
        <input
          required
          autoFocus
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 outline-none focus:border-zinc-600"
          placeholder="Your name"
        />
      </label>
      <label className="block text-sm text-zinc-300">
        Username
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          minLength={3}
          maxLength={24}
          className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 outline-none focus:border-zinc-600"
          placeholder="your_handle"
        />
        <span className="block mt-1 text-xs text-zinc-500">
          lowercase letters, numbers, and underscores
        </span>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-white text-black font-medium py-2.5 hover:bg-zinc-200 disabled:opacity-50 transition"
      >
        {loading ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}