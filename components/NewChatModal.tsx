"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    inputRef.current?.focus();
    // Lock body scroll while the modal is open so the chat behind doesn't
    // scroll on iOS Safari when the user drags inside the modal.
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLoading(false);
      setUsers([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        if (res.status === 401 || res.status === 403) {
          router.replace(res.status === 403 ? "/profile" : "/auth");
          router.refresh();
          return;
        }
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (controller.signal.aborted) return;
        setUsers(data.users as PublicUser[]);
        setError(null);
      } catch {
        if (!controller.signal.aborted) setError("Search failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, router]);

  async function startChat(user: PublicUser) {
    setCreating(user.id);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.status === 401 || res.status === 403) {
        router.replace(res.status === 403 ? "/profile" : "/auth");
        router.refresh();
        return;
      }
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm px-4 pt-[12vh] pb-8 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        className="w-full max-w-md bg-surface-raised backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-elevated overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 grid place-items-center">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 id="new-chat-title" className="font-semibold text-zinc-100">
              New conversation
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-lg min-w-[44px] min-h-[44px] w-11 h-11 grid place-items-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or username..."
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              type="search"
              style={{ fontSize: "16px" }}
              className="w-full bg-zinc-900/80 border border-zinc-700/50 rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto px-3 pb-4">
          {query.trim().length < 2 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-800/50 border border-zinc-700/50 grid place-items-center mb-3">
                <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <p className="text-xs text-zinc-500">
                Type at least 2 characters to search
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-3 text-zinc-500">
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-accent rounded-full animate-spin" />
                <span className="text-xs">Searching...</span>
              </div>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-800/50 border border-zinc-700/50 grid place-items-center mb-3">
                <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                </svg>
              </div>
              <p className="text-xs text-zinc-500">No users found</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {users.map((u) => {
                const name = u.displayName ?? `@${u.username ?? "user"}`;
                const already = existingPeerIds.has(u.id) || u.id === meId;
                return (
                  <li key={u.id}>
                    <button
                      disabled={already || creating !== null}
                      onClick={() => startChat(u)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-zinc-800/40 disabled:opacity-40 disabled:hover:bg-transparent transition-all duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-purple-500 grid place-items-center text-white text-sm font-semibold shadow-glow group-hover:scale-105 transition-transform duration-200">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {name}
                        </p>
                        {u.username && (
                          <p className="truncate text-xs text-zinc-500">
                            @{u.username}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500 group-hover:text-accent transition-colors">
                        {creating === u.id ? (
                          <div className="w-4 h-4 border-2 border-zinc-600 border-t-accent rounded-full animate-spin" />
                        ) : already ? (
                          "Existing"
                        ) : (
                          "Chat"
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 bg-rose-500/10 border-t border-rose-500/20">
            <p className="text-xs text-rose-400 text-center">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
