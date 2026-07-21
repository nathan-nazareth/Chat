"use client";

import { useEffect, useRef, useState } from "react";
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const peerName =
    conversation.peer.displayName ?? `@${conversation.peer.username ?? "user"}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const res = await fetch(
          `/api/conversations/${conversation.id}/messages`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (!cancelled) {
          setMessages(data.messages as ChatMessage[]);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Couldn't load messages");
          setLoading(false);
        }
      }
    }
    load();

    // Lightweight polling for new incoming messages
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/conversations/${conversation.id}/messages`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMessages(data.messages as ChatMessage[]);
      } catch {
        // ignore
      }
    }, 4000);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [conversation.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);

    const optimistic: ChatMessage = {
      id: -Math.floor(Math.random() * 1e9),
      senderId: meId,
      text: trimmed,
      createdAt: Date.now(),
      isRead: false,
    };
    setMessages((prev) => [...prev, optimistic]);
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Send failed");
      }
      const data = await res.json();
      const saved = data.message as ChatMessage;
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? saved : m))
      );
      onSent(conversation.id, saved);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Send failed";
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/80 bg-[#0e0e15]">
        <button
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
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {loading ? (
          <div className="text-center text-sm text-zinc-500 py-8">
            Loading messages…
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

      {error && (
        <div className="px-4 py-1 text-xs text-rose-400">{error}</div>
      )}

      <form
        onSubmit={handleSubmit}
        className="px-3 py-3 border-t border-zinc-800/80 bg-[#0e0e15] flex items-end gap-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
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
