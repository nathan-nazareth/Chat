"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup";
type Step =
  | { name: "email" }
  | { name: "otp"; mode: Mode }
  | { name: "password"; mode: "signup" } // only after OTP during signup
  | { name: "signin-method"; email: string }; // signin: choose password or otp

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
  const actionInFlightRef = useRef(false);

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
      // The server returns {ok: true} for blocked cases (account already
      // exists with password, or passwordless account in signin mode) to
      // avoid email-enumeration leaks. It signals whether a code was
      // actually sent via the `sent` field so the UI doesn't strand the
      // user on the OTP step waiting for a code that will never arrive.
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
    <main className="min-h-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-semibold tracking-tight">Chat</div>
          <p className="text-sm text-zinc-400 mt-1">Sign in or create an account</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 shadow-xl">
          {step.name === "email" && (
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
          )}

          {step.name === "signin-method" && (
            <div className="space-y-3">
              {info && (
                <p className="text-xs text-emerald-400">{info}</p>
              )}
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
              <button
                className="w-full rounded-xl bg-white text-black font-medium py-2.5 hover:bg-zinc-200 transition"
                onClick={async () => {
                  if (await sendOtp("signin", email)) {
                    setStep({ name: "otp", mode: "signin" });
                  }
                }}
                disabled={loading}
              >
                Email me a code
              </button>
              <div className="text-center text-xs text-zinc-500">or</div>
              <PasswordSigninForm
                password={password}
                setPassword={setPassword}
                loading={loading}
                error={passwordError}
                onSubmit={signInWithPassword}
              />
              <button
                className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                onClick={() => setStep({ name: "email" })}
                disabled={loading}
              >
                ← Use a different email
              </button>
            </div>
          )}

          {step.name === "otp" && (
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
          )}

          {step.name === "password" && (
            <PasswordSetupStep
              email={email}
              password={password}
              setPassword={setPassword}
              loading={loading}
              error={error}
              onSubmit={completeSignupWithPassword}
              onBack={() => setStep({ name: "email" })}
            />
          )}

 {error && step.name === "email" && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}
          {info && step.name === "email" && (
            <p className="mt-3 text-xs text-emerald-400">{info}</p>
          )}
        </div>

        {step.name === "email" && (
          <p className="text-center text-sm text-zinc-400 mt-6">
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button
              className="text-white underline-offset-4 hover:underline disabled:opacity-50"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              disabled={loading}
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        )}
      </div>
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
      className="space-y-3"
    >
      <label className="block text-sm text-zinc-300">
        Email
        <input
          type="email"
          required
          autoFocus
          value={props.email}
          onChange={(e) => props.setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 outline-none focus:border-zinc-600"
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={props.loading}
        className="w-full rounded-xl bg-white text-black font-medium py-2.5 hover:bg-zinc-200 disabled:opacity-50 transition"
      >
        {props.loading ? "Sending…" : "Continue"}
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
      className="space-y-3"
    >
      <p className="text-sm text-zinc-300">
        Enter the 6-digit code for <span className="font-medium">{props.email}</span> below.
      </p>
      {props.info && <p className="text-xs text-emerald-400">{props.info}</p>}
      {props.devCode && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-center">
          <p className="text-xs text-zinc-400 mb-1">Your verification code</p>
          <p className="font-mono text-2xl font-bold tracking-[0.3em] text-emerald-400">
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
        value={props.code}
        onChange={(e) => props.setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="w-full text-center tracking-[0.5em] text-2xl rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-3 outline-none focus:border-zinc-600"
        placeholder="000000"
        maxLength={6}
        required
      />
      {props.error && <p className="text-sm text-red-400">{props.error}</p>}
      <button
        type="submit"
        disabled={props.loading || props.code.length !== 6}
        className="w-full rounded-xl bg-white text-black font-medium py-2.5 hover:bg-zinc-200 disabled:opacity-50 transition"
      >
        {props.loading ? "Verifying…" : "Verify"}
      </button>
      <div className="flex justify-between text-xs text-zinc-400">
        <button
          type="button"
          onClick={props.onBack}
          disabled={props.loading}
          className="hover:text-zinc-200 disabled:opacity-50"
        >
          ← Change email
        </button>
        <button
          type="button"
          onClick={props.onResend}
          disabled={props.loading}
          className="hover:text-zinc-200 disabled:opacity-50"
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
      className="space-y-2"
    >
      <input
        type="password"
        required
        autoFocus
        value={props.password}
        onChange={(e) => props.setPassword(e.target.value)}
        className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 outline-none focus:border-zinc-600"
        placeholder="Password"
      />
      {props.error && <p className="text-xs text-red-400">{props.error}</p>}
      <button
        type="submit"
        disabled={props.loading}
        className="w-full rounded-xl bg-zinc-800 text-white font-medium py-2.5 hover:bg-zinc-700 disabled:opacity-50 transition"
      >
        {props.loading ? "Signing in…" : "Sign in with password"}
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      className="space-y-3"
    >
      <p className="text-sm text-zinc-300">
        Create a password for <span className="font-medium">{props.email}</span> (8+ characters).
      </p>
      <input
        type="password"
        required
        autoFocus
        minLength={8}
        value={props.password}
        onChange={(e) => props.setPassword(e.target.value)}
        className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 outline-none focus:border-zinc-600"
        placeholder="••••••••"
      />
      {props.error && <p className="text-sm text-red-400">{props.error}</p>}
      <button
        type="submit"
        disabled={props.loading || props.password.length < 8}
        className="w-full rounded-xl bg-white text-black font-medium py-2.5 hover:bg-zinc-200 disabled:opacity-50 transition"
      >
        {props.loading ? "Creating account…" : "Create account"}
      </button>
      <button
        type="button"
        onClick={props.onBack}
        disabled={props.loading}
        className="block text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
      >
        ← Change email
      </button>
    </form>
  );
}