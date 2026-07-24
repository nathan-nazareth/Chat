"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation } from "@/lib/types";

type SearchResult = {
  id: number;
  conversationId: number;
  senderId: number;
  text: string;
  createdAt: number;
  isRead: boolean;
  peer: {
    id: number;
    displayName: string | null;
    username: string | null;
  };
};

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onJumpToConversation,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onJumpToConversation?: (conversationId: number, query: string) => void;
}) {
  const [filter, setFilter] = useState("");
  /* ---- Global search hooks (must be before early return) ---- */
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [globalPage, setGlobalPage] = useState(1);
  const [globalHasMore, setGlobalHasMore] = useState(false);
  const [globalLoadingMore, setGlobalLoadingMore] = useState(false);
  const [globalClosing, setGlobalClosing] = useState(false);
  const [globalActiveIndex, setGlobalActiveIndex] = useState(-1);
  const globalSearchRef = useRef<HTMLDivElement>(null);
  const globalResultsRef = useRef<HTMLDivElement>(null);
  const globalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalQueryRef = useRef("");
  const observerRef = useRef<HTMLDivElement>(null);

  /* ---- Result counts per conversation (derived from global search results) ---- */
  const resultCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const r of globalResults) {
      counts[r.conversationId] = (counts[r.conversationId] || 0) + 1;
    }
    return counts;
  }, [globalResults]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return conversations;
    const q = filter.toLowerCase();
    return conversations.filter((c) => {
      const name = (c.peer.displayName ?? c.peer.username ?? "").toLowerCase();
      const username = (c.peer.username ?? "").toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [conversations, filter]);

  /* ---- Animated close for global search (declared before effects that use it) ---- */
  const closeGlobalResults = useCallback(() => {
    if (globalCloseTimerRef.current) clearTimeout(globalCloseTimerRef.current);
    setGlobalActiveIndex(-1);
    setGlobalClosing(true);
    globalCloseTimerRef.current = setTimeout(() => {
      setShowGlobalResults(false);
      setGlobalClosing(false);
      setGlobalResults([]);
      setGlobalQuery("");
    }, 200);
  }, []);

  const handleGlobalResultClick = useCallback(
    (result: SearchResult) => {
      closeGlobalResults();
      onJumpToConversation?.(result.conversationId, globalQueryRef.current);
    },
    [onJumpToConversation, closeGlobalResults]
  );

  // Hooks for global search (must be before any early return)
  useEffect(() => {
    if (globalTimerRef.current) clearTimeout(globalTimerRef.current);
    const q = globalQuery.trim();
    if (!q || q.length < 2) {
      closeGlobalResults();
      setGlobalPage(1);
      setGlobalHasMore(false);
      return;
    }
    // Cancel any pending close animation — new query coming in
    if (globalCloseTimerRef.current) {
      clearTimeout(globalCloseTimerRef.current);
      globalCloseTimerRef.current = null;
    }
    setGlobalClosing(false);
    globalQueryRef.current = q;
    setGlobalPage(1);
    setGlobalHasMore(false);
    globalTimerRef.current = setTimeout(async () => {
      setGlobalActiveIndex(-1);
      setGlobalSearching(true);
      try {
        const res = await fetch(`/api/messages/search?q=${encodeURIComponent(q)}&page=1`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setGlobalResults(data.messages ?? []);
          setGlobalHasMore(data.hasMore ?? false);
          setShowGlobalResults(true);
        }
      } catch {
        // Silently fail
      } finally {
        setGlobalSearching(false);
      }
    }, 200);
    return () => {
      if (globalTimerRef.current) clearTimeout(globalTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalQuery]);

  // Close global results on click outside
  useEffect(() => {
    if (!showGlobalResults) return;
    function handleClick(e: MouseEvent) {
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target as Node)) {
        closeGlobalResults();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showGlobalResults, closeGlobalResults]);

  const handleLoadMore = useCallback(async () => {
    const q = globalQueryRef.current;
    if (!q || q.length < 2 || globalLoadingMore) return;
    setGlobalLoadingMore(true);
    const nextPage = globalPage + 1;
    try {
      const res = await fetch(`/api/messages/search?q=${encodeURIComponent(q)}&page=${nextPage}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setGlobalResults((prev) => [...prev, ...(data.messages ?? [])]);
        setGlobalPage(nextPage);
        setGlobalHasMore(data.hasMore ?? false);
      }
    } catch {
      // Silently fail
    } finally {
      setGlobalLoadingMore(false);
    }
  }, [globalPage, globalLoadingMore]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!showGlobalResults || !globalHasMore || globalLoadingMore) return;
    const el = observerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && globalHasMore && !globalLoadingMore) {
          handleLoadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGlobalResults, globalHasMore, globalLoadingMore]);

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
      {/* Global Search */}
      <div className="px-3 pb-2" ref={globalSearchRef}>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            onKeyDown={(e) => {
              const resultsCount = globalResults.length;
              if (resultsCount === 0) return;
              switch (e.key) {
                case "ArrowDown": {
                  e.preventDefault();
                  setGlobalActiveIndex((prev) => {
                    const next = prev < resultsCount - 1 ? prev + 1 : 0;
                    // Scroll active item into view
                    const el = globalResultsRef.current?.querySelector(`[data-gr="${next}"]`);
                    el?.scrollIntoView({ block: "nearest" });
                    return next;
                  });
                  break;
                }
                case "ArrowUp": {
                  e.preventDefault();
                  setGlobalActiveIndex((prev) => {
                    const next = prev > 0 ? prev - 1 : resultsCount - 1;
                    const el = globalResultsRef.current?.querySelector(`[data-gr="${next}"]`);
                    el?.scrollIntoView({ block: "nearest" });
                    return next;
                  });
                  break;
                }
                case "Enter": {
                  if (globalActiveIndex >= 0 && globalActiveIndex < resultsCount) {
                    e.preventDefault();
                    handleGlobalResultClick(globalResults[globalActiveIndex]);
                  }
                  break;
                }
                case "Escape": {
                  e.preventDefault();
                  closeGlobalResults();
                  break;
                }
              }
            }}
            placeholder="Search all messages..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            type="search"
            style={{ fontSize: "16px" }}
            className="w-full bg-zinc-900/60 border border-zinc-800/60 rounded-lg pl-8 pr-3 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-accent/30 transition-colors"
          />
          {globalSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-3.5 h-3.5 border-2 border-zinc-600/30 border-t-zinc-400 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Global results dropdown with mount/unmount animation */}
        {(showGlobalResults || globalClosing) && (
          <div
            className={`absolute left-3 right-3 mt-1 z-50 rounded-xl border border-zinc-700/60 bg-surface-raised backdrop-blur-xl shadow-elevated overflow-hidden ${
              globalClosing ? "animate-fade-out" : "animate-slide-down"
            }`}
          >
            {globalResults.length === 0 ? (
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-zinc-500">No messages match &quot;{globalQuery}&quot;</p>
              </div>
            ) : (
              <div ref={globalResultsRef} className="max-h-72 overflow-y-auto py-1">
                <p className="px-4 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  {globalResults.length} result{globalResults.length !== 1 ? "s" : ""}
                </p>
                {globalResults.map((r, i) => {
                  const peerName = r.peer.displayName ?? `@${r.peer.username ?? "user"}`;
                  return (
                    <button
                      key={r.id}
                      data-gr={i}
                      onClick={() => handleGlobalResultClick(r)}
                      onMouseEnter={() => setGlobalActiveIndex(i)}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors animate-fade-in ${
                        i === globalActiveIndex
                          ? "bg-accent/15 border-l-2 border-accent"
                          : "hover:bg-zinc-800/40 border-l-2 border-transparent"
                      }`}
                    >
                      <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-500 grid place-items-center text-white text-[10px] font-semibold mt-0.5">
                        {peerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-zinc-200 truncate">
                            {peerName}
                          </p>
                          <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">
                            {formatTime(r.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                          {r.text}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {/* Infinite scroll sentinel — only visible when there are more pages to load */}
                {(globalHasMore || globalLoadingMore) && (
                  <div ref={observerRef} className="flex items-center justify-center py-3">
                    {globalLoadingMore && (
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-zinc-600/30 border-t-zinc-400 rounded-full animate-spin" />
                        <span className="text-[10px] text-zinc-500">Loading more…</span>
                      </div>
                    )}
                  </div>
                )}
                {/* End-of-results indicator */}
                {!globalHasMore && !globalLoadingMore && globalResults.length > 0 && (
                  <div className="flex items-center justify-center py-4 px-4">
                    <div className="flex items-center gap-2 text-zinc-600">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-4.5-19.5l-3.9 19.5" />
                      </svg>
                      <span className="text-[10px] font-medium uppercase tracking-wider">No more results</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversation Filter */}
      {conversations.length > 3 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter conversations..."
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
                aria-label="Clear filter"
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

      {/* Clear all filters — visible when either search or conversation filter is active */}
      {(globalQuery.trim().length >= 2 || filter.trim().length > 0) && (
        <div className="px-3 pb-2">
          <button
            onClick={() => {
              closeGlobalResults();
              setFilter("");
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 border border-transparent hover:border-zinc-800/40 transition-all duration-150"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear all filters
          </button>
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
            const searchCount = resultCounts[c.id];
            const isSearching = globalQuery.trim().length >= 2;
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
                      {isSearching && searchCount ? (
                        <span className="text-accent/80">
                          {searchCount} matching message{searchCount !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        previewText(c.lastText)
                      )}
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
