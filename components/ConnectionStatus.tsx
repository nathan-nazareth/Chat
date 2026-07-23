"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Status = "connected" | "offline" | "unstable" | "reconnecting";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Interval between health checks (ms) */
const HEALTH_CHECK_MS = 15_000;

/** Consecutive failures before we declare "unstable" */
const UNSTABLE_THRESHOLD = 2;

/** Cooldown to avoid flickering — minimum time to stay in a degraded state */
const MIN_VISIBLE_MS = 2_000;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>("connected");
  const [failCount, setFailCount] = useState(0);
  const statusRef = useRef<Status>("connected");
  const failRef = useRef(0);
  const mountedRef = useRef(true);
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hiddenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive display state
  const visible = status !== "connected";
  const isDegraded = status === "offline" || status === "unstable";

  /* ---- Transition helper with min-visible cooldown ---- */
  const transitionTo = useCallback((next: Status) => {
    const prev = statusRef.current;
    if (prev === next) return;

    // Going back to connected — enforce a cooldown to avoid flickering
    if (next === "connected") {
      if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
      hiddenTimerRef.current = setTimeout(() => {
        if (mountedRef.current && statusRef.current === "connected") {
          setStatus("connected");
        }
      }, MIN_VISIBLE_MS);
      // Optimistically update the ref so we don't re-enter the degraded state
      statusRef.current = "connected";
      return;
    }

    // Immediate transition for degraded states
    if (hiddenTimerRef.current) {
      clearTimeout(hiddenTimerRef.current);
      hiddenTimerRef.current = null;
    }
    statusRef.current = next;
    setStatus(next);
  }, []);

  /* ---- Health check ---- */
  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/me", {
        method: "GET",
        cache: "no-store",
        // Short timeout so we don't hang
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Success — decrement failure count
      const nextFail = Math.max(0, failRef.current - 1);
      failRef.current = nextFail;
      setFailCount(nextFail);

      if (nextFail <= 0 && statusRef.current !== "connected") {
        transitionTo("connected");
      }
    } catch {
      // Network error or timeout
      const nextFail = failRef.current + 1;
      failRef.current = nextFail;
      setFailCount(nextFail);

      const browserOnline = navigator.onLine;

      if (!browserOnline) {
        transitionTo("offline");
      } else if (nextFail >= UNSTABLE_THRESHOLD) {
        transitionTo("unstable");
      }
    }
  }, [transitionTo]);

  /* ---- Browser online/offline events ---- */
  useEffect(() => {
    function handleOnline() {
      transitionTo("reconnecting");
      // Fire a check immediately to test the connection
      check();
    }
    function handleOffline() {
      failRef.current = UNSTABLE_THRESHOLD; // bump past threshold
      transitionTo("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [check, transitionTo]);

  /* ---- Periodic health checks ---- */
  useEffect(() => {
    // Check once immediately on mount
    check();

    checkTimerRef.current = setInterval(check, HEALTH_CHECK_MS);
    return () => {
      mountedRef.current = false;
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
      if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
    };
  }, [check]);

  /* ---- Teardown hidden timer on unmount ---- */
  useEffect(() => {
    return () => {
      if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
    };
  }, []);

  /* ---- Reconnecting animation: bump to unstable if still failing ---- */
  // If we're stuck in "reconnecting" for more than one check cycle, fall back
  useEffect(() => {
    if (status !== "reconnecting") return;
    const t = setTimeout(() => {
      if (statusRef.current === "reconnecting" && failRef.current > 0) {
        const next = navigator.onLine ? "unstable" : "offline";
        statusRef.current = next;
        setStatus(next);
      }
    }, HEALTH_CHECK_MS + 500);
    return () => clearTimeout(t);
  }, [status]);

  /* ---- Visual treatments ---- */
  const icon = status === "offline" ? OfflineIcon : WarningIcon;
  const label =
    status === "offline"
      ? "No internet connection"
      : status === "unstable"
        ? "Connection unstable"
        : "Reconnecting…";
  const sublabel =
    status === "offline"
      ? "Messages will send once you're back online"
      : status === "unstable"
        ? `Retrying… (${failCount} failed attempt${failCount !== 1 ? "s" : ""})`
        : "Checking connection…";

  const colorClasses =
    status === "offline"
      ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
      : status === "unstable"
        ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
        : "bg-accent/10 border-accent/20 text-accent";

  const dotColor =
    status === "offline"
      ? "bg-rose-400"
      : status === "unstable"
        ? "bg-amber-400"
        : "bg-accent";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      aria-hidden={!visible}
      className={`
        fixed top-0 left-0 right-0 z-50
        flex items-center justify-center
        transition-all duration-500 ease-out
        ${visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"}
      `}
    >
      <div
        className={`
          flex items-center gap-3 px-4 py-2.5 mx-auto mt-2
          rounded-xl border backdrop-blur-xl shadow-elevated
          ${colorClasses}
          animate-slide-down
        `}
      >
        {/* Animated dot + icon */}
        <span className="relative flex items-center justify-center w-5 h-5">
          {icon()}
          {isDegraded && (
            <span
              className={`
                absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${dotColor}
                animate-pulse
              `}
            />
          )}
        </span>

        {/* Text */}
        <div className="flex flex-col">
          <span className="text-xs font-semibold leading-tight">{label}</span>
          <span className="text-[10px] opacity-70 leading-tight mt-0.5">
            {sublabel}
          </span>
        </div>

        {/* Spinner when reconnecting */}
        {status === "reconnecting" && (
          <span
            aria-hidden="true"
            className="w-3.5 h-3.5 rounded-full animate-spin shrink-0"
            style={{
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              opacity: 0.85,
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                             */
/* ------------------------------------------------------------------ */

function WarningIcon() {
  return (
    <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a5 5 0 010-7.072m0 0L3 3m7.5 7.5L8.464 8.464m0 0L5.636 5.636a9 9 0 0112.728 0"
      />
    </svg>
  );
}
