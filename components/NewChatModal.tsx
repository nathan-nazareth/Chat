"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation, PublicUser } from "@/lib/types";

export function NewChatModal({
  meId,
  existingPeerIds,
  onClose,
  onCreated,
}: {
  meId: number;
  existingPeerIds: Set<number>;
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      setError(null);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setUsers(data.users as PublicUser[]);
        setError(null);
      } catch {
        setError("Search failed");
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function startChat(user: PublicUser) {
    setCreating(user.id);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed");
      }
      const data = await res.json();
      onCreated(data.conversation as Conversation);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      setError(msg);
      setCreating(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pt-[12vh] pb-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#11111a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <h2 className="font-semibold">New chat</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 rounded-md w-7 h-7 grid place-items-center"
          >
            ✕
          </button>
        </div>

        <div className="px-3 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or @username…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-2 pb-3">
          {query.trim().length < 2 ? (
            <p className="text-center text-xs text-zinc-600 py-6">
              Type at least 2 characters to search.
            </p>
          ) : loading ? (
            <p className="text-center text-xs text-zinc-500 py-6">
              Searching…
            </p>
          ) : users.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 py-6">
              No users found.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {users.map((u) => {
                const name = u.displayName ?? `@${u.username ?? "user"}`;
                const already = existingPeerIds.has(u.id) || u.id === meId;
                return (
                  <li key={u.id}>
                    <button
                      disabled={already || creating !== null}
                      onClick={() => startChat(u)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-zinc-800/60 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <div className="w-9 h-9 rounded-full bg-indigo-500 grid place-items-center text-white text-sm font-semibold">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        {u.username && (
                          <p className="truncate text-xs text-zinc-500">
                            @{u.username}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">
                        {creating === u.id
                          ? "…"
                          : already
                            ? "exists"
                            : "chat"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <div className="px-4 pb-3 text-xs text-rose-400">{error}</div>
        )}
      </div>
    </div>
  );
}
