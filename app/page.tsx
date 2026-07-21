import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";

export default async function Home() {
  const session = await getSession();
  if (!session.userId) redirect("/auth");

  const displayName = session.displayName;
  const username = session.username;

  if (!displayName || !username) redirect("/profile");

  return (
    <main className="min-h-full flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-zinc-400 text-sm">Logged in as</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Hello, {displayName}
        </h1>
        <p className="mt-3 text-zinc-400">@{username}</p>
        <div className="mt-10">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
