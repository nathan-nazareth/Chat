"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { InstallButton } from "@/components/InstallButton";

type Mode = "signin" | "signup";
type Step =
  | { name: "email" }
  | { name: "otp"; mode: Mode }
  | { name: "password"; mode: "signup" }
  | { name: "signin-method"; email: string };

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [step, setStep] = useState<Step>({ name: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const actionInFlightRef = useRef(false);

  // Bounce signed-in users to the home/profile route immediately so visiting
  // /auth in an active session doesn't show the form (then either succeed
  // signin again or overwrite the session via OTP verify).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.user) {
            router.replace(data.user.profileCompleted ? "/" : "/profile");
            return;
          }
        }
      } catch {
        // ignore — fall through to render the form
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    setError(null);
    setPasswordError(null);
    if (step.name === "email") {
      setInfo(null);
      setDevCode(null);
      setCode("");
      setPassword("");
    }
  }, [step.name]);

  async function sendOtp(purpose: "signup" | "signin", targetEmail: string) {
    if (actionInFlightRef.current) return false;
    actionInFlightRef.current = true;
    setLoading(true);
    setError(null);
    setPasswordError(null);
    setInfo(null);
    setDevCode(null);
    try {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail, purpose }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to send OTP");
      if (data?.devCode) setDevCode(data.devCode);
      const sent = data?.sent !== false;
      setInfo(
        purpose === "signin"
          ? "If your account is set up for sign-in codes, a 6-digit code has been sent. If you don't receive one, try signing in with your password or sign up instead."
          : "If the address is eligible, a 6-digit code has been sent."
      );
      return sent;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send OTP");
      return false;
    } finally {
      actionInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function verifyOtp(purpose: "signup" | "signin") {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code, purpose }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Invalid code");
      if (data?.stage === "need_password") {
        setStep({ name: "password", mode: "signup" });
        return;
      }
      finishAuth(data?.stage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      actionInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function completeSignupWithPassword() {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Sign-up failed");
      finishAuth(data?.stage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-up failed");
    } finally {
      actionInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function signInWithPassword() {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setLoading(true);
    setError(null);
    setPasswordError(null);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Sign-in failed");
      finishAuth(data?.stage);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      actionInFlightRef.current = false;
      setLoading(false);
    }
  }

  function finishAuth(stage?: string) {
    router.push(stage === "ready" ? "/" : "/profile");
    router.refresh();
  }

  return (
    <main className="min-h-full flex items-center justify-center px-4 py-12">
      {!sessionChecked ? (
        // Brief loader while we check /api/me to see whether to bounce
        // an already-signed-in user away. Avoids a flash of the form
        // before the redirect fires.
        <div
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-purple-500 grid place-items-center shadow-glow-lg animate-pulse"
          aria-label="Loading"
        />
      ) : (
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-accent to-purple-500 grid place-items-center shadow-glow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Welcome to Chat
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            {mode === "signup" ? "Create an account to get started" : "Sign in to your account"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-800/60 bg-surface-raised backdrop-blur-xl p-6 shadow-elevated">
          {step.name === "email" && (
            <div className="animate-fade-in">
              <EmailStep
                mode={mode}
                email={email}
                setEmail={setEmail}
                loading={loading}
                onSubmit={async () => {
                  if (mode === "signup") {
                    if (await sendOtp("signup", email)) {
                      setStep({ name: "otp", mode: "signup" });
                    }
                  } else {
                    setStep({ name: "signin-method", email });
                  }
                }}
              />
            </div>
          )}

          {step.name === "signin-method" && (
            <div className="space-y-4 animate-fade-in">
              {info && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <p className="text-xs text-emerald-400">{info}</p>
                </div>
              )}
              {error && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
                  <p className="text-xs text-rose-400">{error}</p>
                </div>
              )}
              <button
                className="w-full rounded-xl bg-accent hover:bg-accent-hover text-white font-medium py-3 shadow-glow hover:shadow-glow-lg transition-all duration-200 active:scale-[0.98]"
                onClick={async () => {
                  if (await sendOtp("signin", email)) {
                    setStep({ name: "otp", mode: "signin" });
                  }
                }}
                disabled={loading}
              >
                {loading ? "Sending..." : "Email me a code"}
              </button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-surface-raised px-3 text-zinc-500">or</span>
                </div>
              </div>
              <PasswordSigninForm
                password={password}
                setPassword={setPassword}
                loading={loading}
                error={passwordError}
                onSubmit={signInWithPassword}
              />
              <button
                className="w-full text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors py-2"
                onClick={() => setStep({ name: "email" })}
                disabled={loading}
              >
                Use a different email
              </button>
            </div>
          )}

          {step.name === "otp" && (
            <div className="animate-fade-in">
              <OtpStep
                email={email}
                mode={step.mode}
                code={code}
                setCode={setCode}
                loading={loading}
                error={error}
                info={info}
                devCode={devCode}
                onSubmit={() => verifyOtp(step.mode)}
                onResend={() => sendOtp(step.mode, email)}
                onBack={() => setStep({ name: "email" })}
              />
            </div>
          )}

          {step.name === "password" && (
            <div className="animate-fade-in">
              <PasswordSetupStep
                email={email}
                password={password}
                setPassword={setPassword}
                loading={loading}
                error={error}
                onSubmit={completeSignupWithPassword}
                onBack={() => setStep({ name: "email" })}
              />
            </div>
          )}

          {error && step.name === "email" && (
            <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
              <p className="text-xs text-rose-400">{error}</p>
            </div>
          )}
          {info && step.name === "email" && (
            <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
              <p className="text-xs text-emerald-400">{info}</p>
            </div>
          )}
        </div>

        {/* Footer Link */}
        {step.name === "email" && (
          <p className="text-center text-sm text-zinc-400 mt-6">
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button
              className="text-accent hover:text-accent-hover font-medium transition-colors"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              disabled={loading}
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        )}

        {/* Install PWA */}
        {step.name === "email" && (
          <div className="flex justify-center mt-4">
            <InstallButton variant="button" className="bg-zinc-800/60 hover:bg-zinc-800 shadow-none hover:shadow-none" />
          </div>
        )}
      </div>
      )}
    </main>
  );
}

function EmailStep(props: {
  mode: Mode;
  email: string;
  setEmail: (v: string) => void;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Email address
        </label>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          value={props.email}
          onChange={(e) => props.setEmail(e.target.value)}
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl bg-zinc-900/80 border border-zinc-700/50 px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
          placeholder="you@example.com"
        />
      </div>
      <button
        type="submit"
        disabled={props.loading}
        className="w-full rounded-xl bg-accent hover:bg-accent-hover text-white font-medium py-3 shadow-glow hover:shadow-glow-lg disabled:opacity-50 disabled:hover:bg-accent disabled:shadow-none transition-all duration-200 active:scale-[0.98]"
      >
        {props.loading ? "Sending..." : "Continue"}
      </button>
    </form>
  );
}

function OtpStep(props: {
  email: string;
  mode: Mode;
  code: string;
  setCode: (v: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  devCode: string | null;
  onSubmit: () => void;
  onResend: () => void;
  onBack: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Verification code
        </label>
        <p className="text-xs text-zinc-400 mb-3">
          Enter the 6-digit code sent to <span className="text-zinc-200 font-medium">{props.email}</span>
        </p>
        {props.info && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 mb-3">
            <p className="text-xs text-emerald-400">{props.info}</p>
          </div>
        )}
        {props.devCode && (
          <div className="rounded-xl bg-accent/10 border border-accent/20 p-4 text-center mb-3">
            <p className="text-xs text-zinc-400 mb-2">Your verification code</p>
            <p className="font-mono text-3xl font-bold tracking-[0.3em] text-accent">
              {props.devCode}
            </p>
          </div>
        )}
        <input
          aria-label="One-time code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={props.code}
          onChange={(e) => props.setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          style={{ fontSize: "16px" }}
          className="w-full text-center tracking-[0.5em] text-2xl font-mono rounded-xl bg-zinc-900/80 border border-zinc-700/50 px-4 py-4 placeholder:text-zinc-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
          placeholder="000000"
          maxLength={6}
          required
        />
      </div>
      {props.error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
          <p className="text-xs text-rose-400">{props.error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={props.loading || props.code.length !== 6}
        className="w-full rounded-xl bg-accent hover:bg-accent-hover text-white font-medium py-3 shadow-glow hover:shadow-glow-lg disabled:opacity-50 disabled:hover:bg-accent disabled:shadow-none transition-all duration-200 active:scale-[0.98]"
      >
        {props.loading ? "Verifying..." : "Verify"}
      </button>
      <div className="flex justify-between text-xs">
        <button
          type="button"
          onClick={props.onBack}
          disabled={props.loading}
          className="text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
        >
          Change email
        </button>
        <button
          type="button"
          onClick={props.onResend}
          disabled={props.loading}
          className="text-accent hover:text-accent-hover disabled:opacity-50 transition-colors"
        >
          Resend code
        </button>
      </div>
    </form>
  );
}

function PasswordSigninForm(props: {
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      className="space-y-3"
    >
      <input
        type="password"
        required
        autoFocus
        autoComplete="current-password"
        value={props.password}
        onChange={(e) => props.setPassword(e.target.value)}
        style={{ fontSize: "16px" }}
        className="w-full rounded-xl bg-zinc-900/80 border border-zinc-700/50 px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
        placeholder="Password"
      />
      {props.error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
          <p className="text-xs text-rose-400">{props.error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={props.loading}
        className="w-full rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
      >
        {props.loading ? "Signing in..." : "Sign in with password"}
      </button>
    </form>
  );
}

function PasswordSetupStep(props: {
  email: string;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  error: string | null;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const strength = getPasswordStrength(props.password);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      className="space-y-4 animate-fade-in"
    >
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Create a password
        </label>
        <p className="text-xs text-zinc-400 mb-3">
          For <span className="text-zinc-200 font-medium">{props.email}</span> (8+ characters)
        </p>
        <input
          type="password"
          required
          autoFocus
          autoComplete="new-password"
          minLength={8}
          value={props.password}
          onChange={(e) => props.setPassword(e.target.value)}
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl bg-zinc-900/80 border border-zinc-700/50 px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
          placeholder="Minimum 8 characters"
        />
        {props.password.length > 0 && (
          <div className="mt-2">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    i < strength.score
                      ? strength.score <= 1
                        ? "bg-rose-400"
                        : strength.score <= 2
                          ? "bg-amber-400"
                          : strength.score <= 3
                            ? "bg-emerald-400"
                            : "bg-emerald-300"
                      : "bg-zinc-700/50"
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">{strength.label}</p>
          </div>
        )}
      </div>
      {props.error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
          <p className="text-xs text-rose-400">{props.error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={props.loading || props.password.length < 8}
        className="w-full rounded-xl bg-accent hover:bg-accent-hover text-white font-medium py-3 shadow-glow hover:shadow-glow-lg disabled:opacity-50 disabled:hover:bg-accent disabled:shadow-none transition-all duration-200 active:scale-[0.98]"
      >
        {props.loading ? "Creating account..." : "Create account"}
      </button>
      <button
        type="button"
        onClick={props.onBack}
        disabled={props.loading}
        className="w-full text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors py-2"
      >
        Change email
      </button>
    </form>
  );
}

function getPasswordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;

  const labels = ["Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[Math.min(score, 3) - 1] || "Too short" };
}
