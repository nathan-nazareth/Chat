import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserById } from "@/lib/db";
import ProfileForm from "@/components/ProfileForm";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session.userId) redirect("/auth");

  const user = await getUserById(session.userId);
  if (!user) redirect("/auth");
  if (user.profile_completed_at) redirect("/");
  if (!user.password_hash) redirect("/auth");

  return (
    <main className="min-h-full flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent to-purple-500 grid place-items-center shadow-glow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Set up your profile
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            Choose how you&apos;ll appear in chat
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-800/60 bg-surface-raised backdrop-blur-xl p-6 shadow-elevated">
          <ProfileForm />
        </div>
      </div>
    </main>
  );
}
