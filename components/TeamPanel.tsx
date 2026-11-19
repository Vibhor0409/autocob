"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Me {
  user: { name: string; email: string };
  workspace: { name: string };
  role: "owner" | "member";
  members: Array<{ name: string; email: string; role: string }>;
  agent: { connected: boolean; usedToday: number; dailyLimit: number };
}

export function TeamPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [invite, setInvite] = useState<{ url: string; expiresOn: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (res.status === 401) {
      window.location.assign("/login");
      return;
    }
    setMe(await res.json());
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function createInvite() {
    setMessage("");
    const res = await fetch("/api/workspace/invite", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(body.message ?? "The invite link could not be created.");
    setInvite(body);
    setCopied(false);
  }

  async function rename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    const res = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Workspace renamed." : (body.message ?? "The name could not be changed."));
    if (res.ok) await load();
  }

  if (!me) return <div className="p-10 text-sm text-ink-2">Loading your team.</div>;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
      <Link href="/app" className="text-sm text-plan underline-offset-2 hover:underline">
        Back to the worklist
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">{me.workspace.name}</h1>
      <p className="mt-1 text-sm text-ink-2">
        Signed in as {me.user.name} ({me.user.email}), {me.role}.
      </p>

      {message && (
        <p role="status" className="mt-4 rounded border border-line bg-sheet px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <section className="mt-8 rounded-md border border-line bg-sheet p-5">
        <h2 className="font-semibold">People</h2>
        <ul className="mt-3 divide-y divide-line/70 text-sm">
          {me.members.map((m) => (
            <li key={m.email} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span>
                {m.name} <span className="text-ink-2">{m.email}</span>
              </span>
              <span className="text-[12px] text-ink-2">{m.role}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={createInvite} className="mt-4 rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85">
          Create an invite link
        </button>
        {invite && (
          <div className="mt-4 rounded border border-line bg-paper p-3 text-sm">
            <p className="text-ink-2">
              Send this link to one teammate. It works until {invite.expiresOn} and is shown only once.
            </p>
            <p className="fig mt-2 text-[13px] break-all">{invite.url}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite.url);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="mt-3 rounded border border-ink/30 bg-sheet px-3 py-1.5 text-sm hover:border-ink"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-md border border-line bg-sheet p-5">
        <h2 className="font-semibold">Case agent</h2>
        <p className="mt-2 text-sm text-ink-2">
          {me.agent.connected ? "Connected." : "Not connected."} {me.agent.usedToday} of {me.agent.dailyLimit} document reads
          and letters used in the last 24 hours, shared by the whole workspace.
        </p>
      </section>

      {me.role === "owner" && (
        <section className="mt-6 rounded-md border border-line bg-sheet p-5">
          <h2 className="font-semibold">Workspace name</h2>
          <form onSubmit={rename} className="mt-3 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="ws-name">
              Workspace name
            </label>
            <input id="ws-name" name="name" required defaultValue={me.workspace.name} className="min-w-52 flex-1 rounded border border-line px-3 py-2 text-sm" />
            <button type="submit" className="rounded border border-ink/30 px-3.5 py-2 text-sm hover:border-ink">
              Rename
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
