"use client";

import Link from "next/link";
import { useState } from "react";

const field = "mt-1 w-full rounded border border-line bg-sheet px-3 py-2 text-sm";

export function AuthForm({ kind, invite }: { kind: "login" | "signup"; invite?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = kind === "signup";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)]));
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invite ? { ...body, invite } : body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.message ?? "That did not work. Try again.");
        setBusy(false);
        return;
      }
      window.location.assign("/app");
    } catch {
      setError("Could not reach AutoCOB. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
      <Link href="/" className="text-[17px] font-bold tracking-tight">
        Auto<span className="text-form-red">COB</span>
      </Link>
      <h1 className="mt-8 text-2xl font-bold tracking-tight">
        {signup ? (invite ? "Join your team's workspace" : "Create your workspace") : "Sign in"}
      </h1>
      <p className="mt-2 text-sm text-ink-2">
        {signup
          ? invite
            ? "You were invited by a teammate. Set up your own sign-in to see the same cases."
            : "One workspace per clinic group or billing company. Invite your team once you are in."
          : "Open your accident-case worklist."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {signup && (
          <label className="block text-[13px] text-ink-2">
            Your name
            <input name="name" required autoComplete="name" className={field} />
          </label>
        )}
        {signup && !invite && (
          <label className="block text-[13px] text-ink-2">
            Clinic or company name
            <input name="workspaceName" required autoComplete="organization" className={field} />
          </label>
        )}
        <label className="block text-[13px] text-ink-2">
          Work email
          <input name="email" type="email" required autoComplete="email" className={field} />
        </label>
        <label className="block text-[13px] text-ink-2">
          Password{signup ? " (at least 10 characters)" : ""}
          <input
            name="password"
            type="password"
            required
            minLength={signup ? 10 : undefined}
            autoComplete={signup ? "new-password" : "current-password"}
            className={field}
          />
        </label>
        {error && (
          <p role="alert" className="text-[13px] text-form-red">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="w-full rounded bg-ink px-4 py-2.5 text-sm font-medium text-sheet hover:bg-ink/85 disabled:opacity-60">
          {busy ? "One moment" : signup ? (invite ? "Join workspace" : "Create workspace") : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        {signup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-plan underline-offset-2 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to AutoCOB?{" "}
            <Link href="/signup" className="text-plan underline-offset-2 hover:underline">
              Create a workspace
            </Link>
          </>
        )}
      </p>
      {signup && (
        <p className="mt-4 text-[12px] text-ink-2">
          AutoCOB is in early access. Use de-identified or test data only until your organisation has a signed data agreement
          with us. There is no password reset by email yet, so keep your password somewhere safe.
        </p>
      )}
    </main>
  );
}
