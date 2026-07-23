"use client";

import { useMemo, useState } from "react";
import type { Conversation } from "@/lib/types";

export function Sidebar({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return conversations;
    const q = filter.toLowerCase();
    return conversations.filter((c) => {
      const name = (c.peer.displayName ?? c.peer.username ?? "").toLowerCase();
      const username = (c.peer.username ?? "").toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [conversations, filter]);

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 grid place-items-center mb-4">
          <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-400">No conversations yet</p>
        <p className="text-xs text-zinc-500 mt-1">
          Start a new chat to begin messaging
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search */}
      {conversations.length > 3 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search conversations..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              type="search"
              style={{ fontSize: "16px" }}
              className="w-full bg-zinc-900/60 border border-zinc-800/60 rounded-lg pl-8 pr-3 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-accent/30 transition-colors"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] grid place-items-center text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-0.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-zinc-500">No matches</p>
          </div>
        ) : (
          filtered.map((c) => {
            const isActive = c.id === activeId;
            const name = c.peer.displayName ?? `@${c.peer.username ?? "user"}`;
            const initials = name.slice(0, 1).toUpperCase();
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group ${
                  isActive
                    ? "bg-accent/10 border border-accent/20"
                    : "hover:bg-zinc-800/40 border border-transparent"
                }`}
              >
                <Avatar name={initials} isActive={isActive} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`truncate text-sm ${
                        c.unread > 0
                          ? "font-semibold text-zinc-100"
                          : "font-medium text-zinc-200"
                      }`}
                    >
                      {name}
                    </p>
                    {c.lastMessageAt && (
                      <span
                        className={`text-[10px] shrink-0 tabular-nums ${
                          c.unread > 0 ? "text-accent" : "text-zinc-500"
                        }`}
                      >
                        {formatTime(c.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className={`truncate text-xs leading-relaxed ${
                        c.unread > 0 ? "text-zinc-300" : "text-zinc-500"
                      }`}
                    >
                      {previewText(c.lastText)}
                    </p>
                    {c.unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-semibold grid place-items-center shadow-glow">
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </nav>

      {/* Count */}
      {conversations.length > 0 && (
        <div className="px-4 py-2 border-t border-zinc-800/40">
          <p className="text-[10px] text-zinc-600 text-center">
            {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function previewText(text: string | null) {
  if (!text) return "Start a conversation";
  return text;
}

function Avatar({ name, isActive }: { name: string; isActive: boolean }) {
  const gradients = [
    "from-blue-500 to-cyan-400",
    "from-purple-500 to-pink-400",
    "from-emerald-500 to-teal-400",
    "from-amber-500 to-orange-400",
    "from-rose-500 to-pink-400",
    "from-violet-500 to-purple-400",
  ];
  // Default to "?" when the initials string is empty so the gradient index is
  // always finite (charCodeAt(0) on "" returns NaN, which would index into
  // `undefined` and break the gradient).
  const seed = name.charCodeAt(0) || "?".charCodeAt(0);
  const idx = Number.isFinite(seed) ? seed % gradients.length : 0;
  return (
    <div
      className={`shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${gradients[idx]} grid place-items-center text-white text-sm font-semibold transition-all duration-150 ${
        isActive ? "shadow-glow scale-105" : "group-hover:scale-105"
      }`}
    >
      {name || "?"}
    </div>
  );
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
