import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserByEmail, getUserById } from "@/lib/db";
import ProfileForm from "@/components/ProfileForm";
import PasswordSetupForm from "@/components/PasswordSetupForm";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session.userId) redirect("/auth");

  const user = await getUserById(session.userId);
  if (!user) redirect("/auth");
  if (user.profile_completed_at) redirect("/");

  // The user is mid-signup: they've verified their email but haven't set a
  // password yet. Render the password-setup step so they don't get sent back
  // to /auth (which would create a redirect loop with the auth page's
  // signed-in-user bounce).
  const needsPassword = !user.password_hash;

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
            {needsPassword ? "Set up your password" : "Set up your profile"}
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            {needsPassword
              ? "Create a password so you can sign back in later"
              : "Choose how you'll appear in chat"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-800/60 bg-surface-raised backdrop-blur-xl p-6 shadow-elevated">
          {needsPassword ? (
            <PasswordSetupForm email={user.email} />
          ) : (
            <ProfileForm />
          )}
        </div>
      </div>
    </main>
  );
}
