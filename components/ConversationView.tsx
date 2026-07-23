"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage, Conversation } from "@/lib/types";

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
  const forceScrollRef = useRef(true);
  const nearBottomRef = useRef(true);
  // Start well below zero and never decrement past -Number.MAX_SAFE_INTEGER.
  // The previous seed (-1) was fragile: --0 evaluates to -0 in JavaScript,
  // and mergeMessages keys optimistics off `m.id < 0`, which would have
  // misclassified -0 as a server message and skipped the reconciliation
  // path. Starting at -2 makes the first send produce -3, and the bound
  // guarantees we never produce -0 or hit the integer-precision floor.
  const optimisticIdRef = useRef<number>(-2);
  // Mirror `sending` in a ref so synchronous re-entry (e.g. the user mashing
  // Enter on the textarea before React has flushed the `sending` state) is
  // still blocked. Without this, two synchronous submits both see
  // `sending === false` from their closure and fire two POSTs.
  const sendingRef = useRef(false);
  // Ref to the form element so onKeyDown can submit it via native event
  // instead of casting KeyboardEvent to FormEvent.
  const formRef = useRef<HTMLFormElement>(null);

  const peerName =
    conversation.peer.displayName ?? `@${conversation.peer.username ?? "user"}`;

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
        await fetch(`/api/conversations/${conversation.id}/messages`, {
          method: "PATCH",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        // Best-effort: don't block on mark-read failure
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
        return data.messages as ChatMessage[];
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
      // fetchMessages flips `cancelled = true` on auth failures so the router
      // can navigate away. Bail before scheduling another poll so we don't
      // keep hammering the server with requests that will all 401/403.
      if (!cancelled) pollTimeout = setTimeout(() => refresh(false), 4000);
    }
    // Mark messages as read once on conversation open, not on every poll tick.
    void markRead();
    void refresh(true);

    return () => {
      cancelled = true;
      controller.abort();
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [conversation.id, router]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (forceScrollRef.current || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      forceScrollRef.current = false;
      nearBottomRef.current = true;
    }
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);

    // Reset the counter when it would otherwise collide with server ids (which
    // are positive integers). This is unreachable in practice (10^15 sends
    // per page load) but keeps the invariant explicit.
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
        // If a poll already merged `saved` into state (race: server saved the
        // message before our POST response was processed), just drop the
        // optimistic; otherwise swap it in. Prevents duplicates in either case.
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

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/80 bg-[#0e0e15]">
        <button
          type="button"
          aria-label="Back to conversations"
          onClick={onBack}
          className="md:hidden rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800/60"
        >
          ←
        </button>
        <div className="w-9 h-9 rounded-full bg-indigo-500 grid place-items-center text-white text-sm font-semibold">
          {peerName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{peerName}</p>
          {conversation.peer.username && (
            <p className="text-xs text-zinc-500 truncate">
              @{conversation.peer.username}
            </p>
          )}
        </div>
      </header>

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
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {loading ? (
          <div className="text-center text-sm text-zinc-500 py-8">
            Loading messages…
          </div>
        ) : error === "Couldn't load messages" ? (
          <div className="text-center text-sm text-rose-400 py-8">
            Couldn&apos;t load messages. Retrying…
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-8">
            This is the start of your conversation with {peerName}.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === meId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] sm:max-w-[68%] px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    mine
                      ? "bg-indigo-500 text-white rounded-br-sm"
                      : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && error !== "Couldn't load messages" && (
        <div className="px-4 py-1 text-xs text-rose-400">{error}</div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="px-3 py-3 border-t border-zinc-800/80 bg-[#0e0e15] flex items-end gap-2"
      >
        <textarea
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
          placeholder={`Message ${peerName}…`}
          rows={1}
          className="flex-1 resize-none max-h-32 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:hover:bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white"
        >
          Send
        </button>
      </form>
    </>
  );
}
