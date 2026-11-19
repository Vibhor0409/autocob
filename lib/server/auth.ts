// Accounts and sessions. Passwords are hashed with scrypt and a per-user salt. A session is a
// random token in an HttpOnly cookie; only its SHA-256 is stored, so a database leak does not
// hand out live sessions.
import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { sql } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "autocob_session";
const SESSION_DAYS = 14;
const AGENT_RUNS_PER_DAY = 100;

export interface Session {
  user: { id: string; name: string; email: string };
  workspace: { id: string; name: string };
  role: "owner" | "member";
}

export const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");
export const newToken = (): string => randomBytes(32).toString("base64url");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function startSession(userId: string): Promise<void> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql()`insert into sessions (token_hash, user_id, expires_at) values (${sha256(token)}, ${userId}, ${expires.toISOString()})`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql()`delete from sessions where token_hash = ${sha256(token)}`;
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const rows = await sql()`
    select u.id as user_id, u.name as user_name, u.email, w.id as workspace_id, w.name as workspace_name, m.role
    from sessions s
    join users u on u.id = s.user_id
    join memberships m on m.user_id = u.id
    join workspaces w on w.id = m.workspace_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()
    limit 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    user: { id: r.user_id, name: r.user_name, email: r.email },
    workspace: { id: r.workspace_id, name: r.workspace_name },
    role: r.role,
  };
}

/** A browser only sends the session cookie on same-site requests, and this rejects the rest. */
export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return true; // non-browser clients send no Origin and carry no ambient cookie
  try {
    return new URL(origin).host === h.get("host");
  } catch {
    return false;
  }
}

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** For route handlers: the session, or the response to return instead. */
export async function requireSession(opts: { write?: boolean } = {}): Promise<Session | Response> {
  if (opts.write && !(await sameOrigin())) return json({ message: "Request refused." }, 403);
  const session = await getSession();
  return session ?? json({ message: "Sign in to continue." }, 401);
}

export async function agentRunsToday(workspaceId: string): Promise<number> {
  const rows = await sql()`select count(*)::int as n from agent_runs where workspace_id = ${workspaceId} and created_at > now() - interval '24 hours'`;
  return rows[0]?.n ?? 0;
}

/** Records one agent run, or says the workspace has used today's allowance. */
export async function spendAgentRun(s: Session, job: string): Promise<boolean> {
  if ((await agentRunsToday(s.workspace.id)) >= AGENT_RUNS_PER_DAY) return false;
  await sql()`insert into agent_runs (workspace_id, user_id, job) values (${s.workspace.id}, ${s.user.id}, ${job})`;
  return true;
}

export const AGENT_DAILY_LIMIT = AGENT_RUNS_PER_DAY;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const cleanEmail = (v: unknown): string | null => {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  return EMAIL.test(e) && e.length <= 254 ? e : null;
};
export const cleanText = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max) : "";
