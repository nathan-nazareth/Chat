"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, Conversation } from "@/lib/types";
import {
  generateIdentityBundle,
  loadIdentity,
  initSessionWithPeer,
  getOrCreateSession,
  encryptMessage,
  decryptMessage,
  type IdentityKeyBundle,
  type RatchetSession,
} from "@/lib/e2e";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateSeparator(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - msgDay.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "long" });
  }
  return d.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** Should the message show a timestamp? True when it's the last in a group
 *  from the same sender within a 2-minute window, or the last message overall. */
function isGroupEnd(
  messages: ChatMessage[],
  idx: number,
  meId: number
): boolean {
  const m = messages[idx];
  const next = messages[idx + 1];
  if (!next) return true;
  if (next.senderId !== m.senderId) return true;
  if (next.createdAt - m.createdAt > 120_000) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ConversationView({
  conversation,
  meId,
  onSent,
  onBack,
}: {
  conversation: Conversation;
  meId: number;
  onSent: (convId: number, msg: ChatMessage) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const forceScrollRef = useRef(true);
  const nearBottomRef = useRef(true);
  const optimisticIdRef = useRef<number>(-2);
  const sendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const identityRef = useRef<IdentityKeyBundle | null>(null);
  const sessionRef = useRef<RatchetSession | null>(null);

  const peerName =
    conversation.peer.displayName ?? `@${conversation.peer.username ?? "user"}`;

  /* ---- Auto-resize textarea ---- */
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  useEffect(resizeTextarea, [text, resizeTextarea]);

  /* ---- Init E2E keys ---- */
  useEffect(() => {
    let cancelled = false;
    async function initKeys() {
      if (cancelled) return;
      try {
        let identity = await loadIdentity(meId);
        if (!identity) {
          const { local, serverPayload } = await generateIdentityBundle(meId);
          if (cancelled) return;
          identity = local;
          await fetch("/api/keys/bundle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(serverPayload),
          });
        }
        identityRef.current = identity;
        try {
          let session = await getOrCreateSession(meId, conversation.peer.id);
          if (!session) {
            const res = await fetch(`/api/keys/bundle?userId=${conversation.peer.id}`);
            if (res.ok) {
              const peerKeys = await res.json();
              session = await initSessionWithPeer(meId, conversation.peer.id, peerKeys.identityPub, peerKeys.signedPrekeyPub);
            }
          }
          if (session && !cancelled) sessionRef.current = session;
        } catch (e) {
          console.warn("E2E session init failed:", e);
        }
      } catch (e) {
        console.warn("E2E key init failed:", e);
      }
    }
    initKeys();
    return () => { cancelled = true; };
  }, [meId, conversation.peer.id]);

  /* ---- Fetch & poll ---- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    forceScrollRef.current = true;

    const controller = new AbortController();
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;

    function mergeMessages(prev: ChatMessage[], server: ChatMessage[]): ChatMessage[] {
      const map = new Map<number, ChatMessage>();
      const representedServerIds = new Set(
        prev.filter((m) => m.id > 0).map((m) => m.id)
      );
      for (const m of server) map.set(m.id, m);
      for (const m of prev) {
        if (m.id < 0) {
          const matched = server.find(
            (s) =>
              !representedServerIds.has(s.id) &&
              s.senderId === m.senderId &&
              s.text === m.text &&
              Math.abs(s.createdAt - m.createdAt) < 30000
          );
          if (matched) representedServerIds.add(matched.id);
          else map.set(m.id, m);
        } else if (!map.has(m.id)) {
          map.set(m.id, m);
        }
      }
      return Array.from(map.values()).sort(
        (a, b) => a.createdAt - b.createdAt || a.id - b.id
      );
    }

    async function markRead() {
      try {
        await fetch(`/api/conversations/${conversation.id}/read`, {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        // Best-effort
      }
    }

    async function fetchMessages(): Promise<ChatMessage[] | null> {
      try {
        const res = await fetch(
          `/api/conversations/${conversation.id}/messages`,
          { method: "GET", cache: "no-store", signal: controller.signal }
        );
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            cancelled = true;
            router.replace(res.status === 403 ? "/profile" : "/auth");
            router.refresh();
          }
          return null;
        }
        if (!res.ok) return null;
        const data = await res.json();
        const serverMessages = data.messages as (ChatMessage & { ciphertext?: string | null; iv?: string | null; counter?: number | null })[];
        const session = sessionRef.current;
        if (session) {
          for (const msg of serverMessages) {
            if (msg.ciphertext && msg.iv && msg.counter !== null && msg.counter !== undefined) {
              try { msg.text = await decryptMessage(session, msg.ciphertext, msg.iv, msg.counter); }
              catch { msg.text = "[Encrypted message]"; }
            }
          }
        }
        return serverMessages;
      } catch {
        return null;
      }
    }

    async function refresh(initial: boolean) {
      if (document.visibilityState === "hidden") {
        pollTimeout = setTimeout(() => refresh(initial), 4000);
        return;
      }
      const server = await fetchMessages();
      if (cancelled) return;
      if (server === null) {
        if (initial) {
          setError("Couldn't load messages");
          setLoading(false);
        }
      } else {
        setMessages((prev) => mergeMessages(prev, server));
        setError((current) =>
          current === "Couldn't load messages" ? null : current
        );
        setLoading(false);
      }
      if (!cancelled) pollTimeout = setTimeout(() => refresh(false), 4000);
    }
    void markRead();
    void refresh(true);

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [conversation.id, router]);

  /* ---- Auto-scroll ---- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (forceScrollRef.current || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      forceScrollRef.current = false;
      nearBottomRef.current = true;
    }
  }, [messages]);

  /* ---- Submit ---- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);

    const nextOptimisticId =
      optimisticIdRef.current > Number.MIN_SAFE_INTEGER + 1
        ? optimisticIdRef.current - 1
        : -2;
    optimisticIdRef.current = nextOptimisticId;
    const optimistic: ChatMessage = {
      id: nextOptimisticId,
      senderId: meId,
      text: trimmed,
      createdAt: Date.now(),
      isRead: false,
    };
    setMessages((prev) => [...prev, optimistic]);
    forceScrollRef.current = true;
    setText("");

    try {
      const res = await fetch(
        `/api/conversations/${conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        }
      );
      if (res.status === 401 || res.status === 403) {
        router.replace(res.status === 403 ? "/profile" : "/auth");
        router.refresh();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Send failed");
      }
      const data = (await res.json()) as { message?: ChatMessage };
      const saved = data.message;
      if (!saved || typeof saved.id !== "number") {
        throw new Error("Send failed");
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === saved.id)) {
          return prev.filter((m) => m.id !== optimistic.id);
        }
        return prev.map((m) => (m.id === optimistic.id ? saved : m));
      });
      onSent(conversation.id, saved);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Send failed";
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText((current) => (current.length === 0 ? trimmed : current));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  /* ---- Memoised grouped render data ---- */
  const renderItems = useMemo(() => {
    type Item =
      | { kind: "separator"; date: string; key: string }
      | { kind: "message"; msg: ChatMessage; showTime: boolean; key: number | string };
    const items: Item[] = [];
    let lastDate: string | null = null;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const dateLabel = formatDateSeparator(m.createdAt);
      if (dateLabel !== lastDate) {
        items.push({ kind: "separator", date: dateLabel, key: `d-${dateLabel}` });
        lastDate = dateLabel;
      }
      items.push({
        kind: "message",
        msg: m,
        showTime: isGroupEnd(messages, i, meId),
        key: m.id,
      });
    }
    return items;
  }, [messages, meId]);

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 bg-surface-raised backdrop-blur-xl">
        <button
          type="button"
          aria-label="Back to conversations"
          onClick={onBack}
          className="md:hidden rounded-lg p-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-purple-500 grid place-items-center text-white text-sm font-semibold shadow-glow">
          {peerName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate text-zinc-100">{peerName}</p>
          {conversation.peer.username && (
            <p className="text-xs text-zinc-500 truncate">
              @{conversation.peer.username}
            </p>
          )}
        </div>
        {/* E2E indicator */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400/70">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          E2E
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Messages with ${peerName}`}
        onScroll={(event) => {
          const el = event.currentTarget;
          nearBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        {loading ? (
          <MessageSkeleton />
        ) : error === "Couldn't load messages" ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-rose-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span className="text-sm">Couldn&apos;t load messages. Retrying...</span>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
            <div className="relative mb-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/15 to-purple-500/15 border border-accent/15 grid place-items-center">
                <svg className="w-8 h-8 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-medium text-zinc-300">
              Start of your conversation
            </p>
            <p className="text-xs text-zinc-500 mt-1.5 max-w-[240px] leading-relaxed">
              Send a message below to start chatting with {peerName}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {renderItems.map((item) => {
              if (item.kind === "separator") {
                return (
                  <div key={item.key} className="flex items-center gap-3 py-4">
                    <div className="flex-1 h-px bg-zinc-800/60" />
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider shrink-0">
                      {item.date}
                    </span>
                    <div className="flex-1 h-px bg-zinc-800/60" />
                  </div>
                );
              }
              const { msg, showTime } = item;
              const mine = msg.senderId === meId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"} ${
                    showTime ? "mb-3" : "mb-0.5"
                  }`}
                >
                  <div className="max-w-[78%] sm:max-w-[68%]">
                    <div
                      className={`px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                        mine
                          ? `bg-gradient-to-br from-accent to-indigo-600 text-white ${
                              showTime ? "rounded-2xl rounded-br-md" : "rounded-2xl"
                            } shadow-glow/50`
                          : `bg-zinc-800/80 text-zinc-100 border border-zinc-700/40 ${
                              showTime ? "rounded-2xl rounded-bl-md" : "rounded-2xl"
                            }`
                      }`}
                    >
                      {msg.text}
                    </div>
                    {showTime && (
                      <p
                        className={`text-[10px] text-zinc-500 mt-1 ${
                          mine ? "text-right mr-1" : "ml-1"
                        }`}
                      >
                        {formatMessageTime(msg.createdAt)}
                        {mine && msg.isRead && (
                          <span className="ml-1.5 text-accent">seen</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && error !== "Couldn't load messages" && (
        <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20 animate-slide-down">
          <p className="text-xs text-rose-400 text-center">{error}</p>
        </div>
      )}

      {/* Input Area */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="px-3 sm:px-4 py-3 border-t border-zinc-800/60 bg-surface-raised backdrop-blur-xl"
      >
        <div className="flex items-end gap-2 sm:gap-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            maxLength={4000}
            placeholder={`Message ${peerName}...`}
            rows={1}
            className="flex-1 resize-none bg-zinc-900/80 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200 min-h-[40px] max-h-32 leading-relaxed"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:hover:bg-accent disabled:cursor-not-allowed w-10 h-10 grid place-items-center text-white shadow-glow hover:shadow-glow-lg transition-all duration-200 active:scale-90 shrink-0"
            aria-label="Send message"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>
        {text.length > 3800 && (
          <p className="text-[10px] text-zinc-500 mt-1.5 text-right">
            {4000 - text.length} characters remaining
          </p>
        )}
      </form>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                   */
/* ------------------------------------------------------------------ */

function MessageSkeleton() {
  return (
    <div className="space-y-4 py-4 animate-fade-in">
      {[0, 1, 2, 3, 4].map((i) => {
        const isMe = i % 3 === 0;
        const widths = ["45%", "65%", "35%", "55%", "40%"];
        return (
          <div
            key={i}
            className={`flex ${isMe ? "justify-end" : "justify-start"}`}
          >
            <div
              className="h-9 rounded-2xl bg-zinc-800/40 animate-pulse"
              style={{ width: widths[i] }}
            />
          </div>
        );
      })}
    </div>
  );
}
