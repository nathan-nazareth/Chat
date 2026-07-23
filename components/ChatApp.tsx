"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Conversation, PublicUser } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { ConversationView } from "@/components/ConversationView";
import { NewChatModal } from "@/components/NewChatModal";
import { SignOutButton } from "@/components/SignOutButton";

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

  // Live cross-device updates: refresh the conversation list (previews, order,
  // unread badges) periodically so messages sent from other devices appear.
  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    async function refresh() {
      const version = conversationVersionRef.current;
      try {
        const res = await fetch("/api/conversations", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 401 || res.status === 403) {
          cancelled = true;
          router.replace(res.status === 403 ? "/profile" : "/auth");
          router.refresh();
          return;
        }
        if (!res.ok) return;
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
      } catch {
      } finally {
        if (!cancelled) timeout = setTimeout(refresh, 5000);
      }
    }
    timeout = setTimeout(refresh, 5000);
    return () => {
      cancelled = true;
      controller.abort();
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
    <div className="flex h-dvh w-full overflow-hidden bg-[#0b0b10] text-zinc-100">
      <div className="flex w-full max-w-6xl mx-auto">
        <aside
          className={`${
            active ? "hidden md:flex" : "flex"
          } w-full md:w-80 lg:w-96 flex-col border-r border-zinc-800/80 bg-[#0e0e15]`}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-zinc-800/80">
            <div className="min-w-0">
              <p className="text-sm text-zinc-400 truncate">Signed in</p>
              <p className="font-semibold truncate">
                {me.displayName}
                <span className="text-zinc-500 font-normal">
                  {" "}
                  @{me.username}
                </span>
              </p>
            </div>
            <SignOutButton compact />
          </div>

          <div className="px-3 py-3">
            <button
              onClick={() => setShowNew(true)}
              className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 transition-colors px-3 py-2.5 text-sm font-medium text-white shadow-sm"
            >
              + New chat
            </button>
          </div>

          <Sidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
          />
        </aside>

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
            <EmptyState onNew={() => setShowNew(true)} />
          )}
        </section>
      </div>

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

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="w-16 h-16 rounded-full bg-zinc-800/60 grid place-items-center text-2xl mb-4">
        💬
      </div>
      <h2 className="text-lg font-semibold">No conversation selected</h2>
      <p className="text-sm text-zinc-400 mt-1 max-w-sm">
        Start a new chat with anyone who&apos;s registered.
      </p>
      <button
        onClick={onNew}
        className="mt-5 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-2 text-sm font-medium text-white"
      >
        Start a new chat
      </button>
    </div>
  );
}

export type { ChatMessage, Conversation, PublicUser };
