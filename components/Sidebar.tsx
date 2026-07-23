"use client";

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
  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-sm text-zinc-500">
        <p>No chats yet.</p>
        <p className="mt-1">Tap “New chat” to find someone.</p>
      </div>
    );
  }

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
      {conversations.map((c) => {
        const isActive = c.id === activeId;
        const name = c.peer.displayName ?? `@${c.peer.username ?? "user"}`;
        const initials = name.slice(0, 1).toUpperCase();
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-colors ${
              isActive ? "bg-zinc-800/80" : "hover:bg-zinc-800/40"
            }`}
          >
            <Avatar name={initials} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`truncate text-sm ${
                    c.unread > 0 ? "font-semibold text-white" : "font-medium text-zinc-200"
                  }`}
                >
                  {name}
                </p>
                {c.lastMessageAt && (
                  <span
                    className={`text-[10px] shrink-0 ${
                      c.unread > 0 ? "text-emerald-400" : "text-zinc-500"
                    }`}
                  >
                    {formatTime(c.lastMessageAt)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p
                  className={`truncate text-xs ${
                    c.unread > 0 ? "text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  {previewText(c.lastText)}
                </p>
                {c.unread > 0 && (
                  <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-semibold grid place-items-center">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function previewText(text: string | null) {
  if (!text) return "Say hi 👋";
  return text;
}

function Avatar({ name }: { name: string }) {
  const colors = [
    "bg-indigo-500",
    "bg-rose-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-violet-500",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div
      className={`shrink-0 w-9 h-9 rounded-full grid place-items-center text-white text-sm font-semibold ${colors[idx]}`}
    >
      {name}
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
