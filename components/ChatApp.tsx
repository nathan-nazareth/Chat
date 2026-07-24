"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Conversation, PublicUser } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { ConversationView } from "@/components/ConversationView";
import { NewChatModal } from "@/components/NewChatModal";
import { SignOutButton } from "@/components/SignOutButton";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { InstallButton } from "@/components/InstallButton";

type Me = {
  id: number;
  displayName: string;
  username: string;
};

export function ChatApp({
  me,
  initialConversations,
}: {
  me: Me;
  initialConversations: Conversation[];
}) {
  const router = useRouter();
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<number | null>(
    initialConversations[0]?.id ?? null
  );
  const [showNew, setShowNew] = useState(false);
  const activeIdRef = useRef(activeId);
  const conversationVersionRef = useRef(0);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let inflight = false;
    let consecutiveFailures = 0;
    let visible = !document.hidden;

    function schedule(delay: number) {
      if (cancelled) return;
      if (timeout) clearTimeout(timeout);
      // While the tab is hidden, skip polls entirely (battery + network) and
      // reschedule a wake-up when the tab becomes visible again.
      if (!visible) {
        timeout = setTimeout(() => schedule(1_000), 1_000);
        return;
      }
      timeout = setTimeout(refresh, delay);
    }

    async function refresh() {
      if (cancelled || inflight) return;
      inflight = true;
      const controller = new AbortController();
      const version = conversationVersionRef.current;
      try {
        const res = await fetch("/api/conversations", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          cancelled = true;
          router.replace(res.status === 403 ? "/profile" : "/auth");
          router.refresh();
          return;
        }
        if (!res.ok) {
          consecutiveFailures++;
          schedule(Math.min(30_000, 1_000 * 2 ** Math.min(consecutiveFailures, 5)));
          return;
        }
        const data = await res.json();
        if (
          cancelled ||
          version !== conversationVersionRef.current ||
          !Array.isArray(data.conversations)
        ) {
          return;
        }
        const currentActiveId = activeIdRef.current;
        const next = (data.conversations as Conversation[])
          .map((conversation) =>
            conversation.id === currentActiveId
              ? { ...conversation, unread: 0 }
              : conversation
          )
          .sort(
            (a, b) =>
              (b.lastMessageAt ?? b.createdAt) -
              (a.lastMessageAt ?? a.createdAt)
          );
        setConversations(next);
        consecutiveFailures = 0;
        schedule(5_000);
      } catch {
        if (cancelled) return;
        consecutiveFailures++;
        schedule(Math.min(30_000, 1_000 * 2 ** Math.min(consecutiveFailures, 5)));
      } finally {
        inflight = false;
        controller.abort();
      }
    }

    function onVisibilityChange() {
      const next = !document.hidden;
      if (next && !visible) {
        // Re-armed on focus — fire immediately so the user sees current state.
        visible = true;
        if (timeout) clearTimeout(timeout);
        void refresh();
      } else {
        visible = false;
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    schedule(1_000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timeout) clearTimeout(timeout);
    };
  }, [router]);

  function handleSelect(id: number) {
    conversationVersionRef.current += 1;
    activeIdRef.current = id;
    setActiveId(id);
    // Optimistically clear the unread badge; the server marks it read on open.
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
    // Tell the server to mark this conversation read in the background so
    // other devices see the badge cleared promptly. Fire-and-forget.
    void fetch(`/api/conversations/${id}/read`, { method: "POST" }).catch(
      () => {}
    );
  }

  function upsertConversation(conv: Conversation) {
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === conv.id);
      const next = exists
        ? prev.map((c) => (c.id === conv.id ? conv : c))
        : [conv, ...prev];
      return next.sort(
        (a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt)
      );
    });
  }

  function handleCreated(conv: Conversation) {
    conversationVersionRef.current += 1;
    activeIdRef.current = conv.id;
    upsertConversation(conv);
    setActiveId(conv.id);
    setShowNew(false);
  }

  function handleSent(convId: number, msg: ChatMessage) {
    conversationVersionRef.current += 1;
    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === convId
              ? {
                  ...c,
                  lastText: msg.text,
                  lastMessageAt: msg.createdAt,
                  unread: 0,
                }
            : c
        )
        .sort(
          (a, b) =>
            (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt)
        )
    );
  }

  function handleBack() {
    conversationVersionRef.current += 1;
    activeIdRef.current = null;
    setActiveId(null);
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-surface-base text-zinc-100">
      <ConnectionStatus />
      <div className="flex w-full max-w-6xl mx-auto">
        {/* Sidebar */}
        <aside
          className={`${
            active ? "hidden md:flex" : "flex"
          } w-full md:w-80 lg:w-[340px] flex-col border-r border-zinc-800/60 bg-surface-raised backdrop-blur-xl`}
        >
          {/* User Profile Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-purple-500 grid place-items-center text-white text-sm font-semibold shadow-glow">
                {me.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate text-zinc-100">
                  {me.displayName}
                </p>
                <p className="text-xs text-zinc-500 truncate">
                  @{me.username}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <InstallButton />
              <SignOutButton compact />
            </div>
          </div>

          {/* New Chat Button */}
          <div className="px-4 py-3">
            <button
              onClick={() => setShowNew(true)}
              className="w-full rounded-xl bg-accent hover:bg-accent-hover transition-all duration-200 px-4 py-2.5 text-sm font-medium text-white shadow-glow hover:shadow-glow-lg active:scale-[0.98]"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New conversation
              </span>
            </button>
          </div>

          {/* Conversation List */}
          <Sidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
          />
        </aside>

        {/* Main Content */}
        <section
          className={`${
            active ? "flex" : "hidden md:flex"
          } flex-1 min-w-0 flex-col`}
        >
          {active ? (
            <ConversationView
              key={active.id}
              conversation={active}
              meId={me.id}
              onSent={handleSent}
              onBack={handleBack}
            />
          ) : (
            <EmptyState onNew={() => setShowNew(true)} meName={me.displayName} />
          )}
        </section>
      </div>

      {/* New Chat Modal */}
      {showNew && (
        <NewChatModal
          meId={me.id}
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
          existingPeerIds={new Set(conversations.map((c) => c.peer.id))}
        />
      )}
    </div>
  );
}

function EmptyState({ onNew, meName }: { onNew: () => void; meName?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 animate-fade-in">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/15 to-purple-500/15 border border-accent/15 grid place-items-center">
          <svg className="w-10 h-10 text-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent animate-pulse" />
      </div>
      <h2 className="text-xl font-semibold text-zinc-100 mb-2">
        {meName ? `Welcome back, ${meName}` : "Welcome back"}
      </h2>
      <p className="text-sm text-zinc-400 mt-1 max-w-sm leading-relaxed">
        Select a conversation to start chatting, or create a new one to connect with someone.
      </p>
      <button
        onClick={onNew}
        className="mt-6 rounded-xl bg-accent hover:bg-accent-hover px-6 py-2.5 text-sm font-medium text-white shadow-glow hover:shadow-glow-lg transition-all duration-200 active:scale-[0.98]"
      >
        Start a new chat
      </button>
      <div className="mt-8 flex items-center gap-4 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/50 font-mono">Enter</kbd>
          send
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/50 font-mono">Shift+Enter</kbd>
          new line
        </span>
      </div>
    </div>
  );
}

export type { ChatMessage, Conversation, PublicUser };
