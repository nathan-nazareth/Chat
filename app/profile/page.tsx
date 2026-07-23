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
  // A user without a password must complete /api/auth/signup-password
  // before they can finalize their profile. Otherwise /api/profile would
  // leave the account stuck in the "profile_complete && no password" state
  // described in lib/db.ts:setProfile.
  if (!user.password_hash) redirect("/auth");

  return (
    <main className="min-h-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Set up your profile</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Choose how you&apos;ll appear in chat.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 shadow-xl">
          <ProfileForm />
        </div>
      </div>
    </main>
  );
}
