import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listConversations, getUserById } from "@/lib/db";
import { ChatApp } from "@/components/ChatApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session.userId) redirect("/auth");

  const displayName = session.displayName;
  const username = session.username;

  if (!displayName || !username) redirect("/profile");

  const me = await getUserById(session.userId);
  if (!me) redirect("/auth");

  const rows = (await listConversations(me.id)).map((r) => ({
    id: r.id,
    peer: {
      id: r.peer_id,
      displayName: r.peer_display_name,
      username: r.peer_username,
    },
    lastText: r.last_text,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
  }));

  return (
    <ChatApp
      me={{
        id: me.id,
        displayName,
        username,
      }}
      initialConversations={rows}
    />
  );
}
