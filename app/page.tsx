import { redirect } from "next/navigation";
import { getUserById } from "@/lib/db";
import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";

export default async function Home() {
  const session = await getSession();
  if (!session.userId) redirect("/auth");

  const user = getUserById(session.userId);
  if (!user) redirect("/auth");

  if (!user.profile_completed_at) redirect("/profile");

  return (
    <main className="min-h-full flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-zinc-400 text-sm">Logged in as</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Hello, {user.display_name}
        </h1>
        <p className="mt-3 text-zinc-400">@{user.username}</p>
        <div className="mt-10">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}