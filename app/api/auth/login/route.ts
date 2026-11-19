import { cleanEmail, hashPassword, json, sameOrigin, startSession, verifyPassword } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";

const MAX_FAILURES = 8; // per email, per 15 minutes

export async function POST(request: Request) {
  if (!(await sameOrigin())) return json({ message: "Request refused." }, 403);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = cleanEmail(body.email);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!email || !password) return json({ message: "Enter your email and password." }, 400);

  const db = sql();
  const recent = await db`select count(*)::int as n from login_attempts where email = ${email} and at > now() - interval '15 minutes'`;
  if ((recent[0]?.n ?? 0) >= MAX_FAILURES) {
    return json({ message: "Too many attempts. Wait 15 minutes and try again." }, 429);
  }

  const rows = await db`select id, password_hash from users where lower(email) = ${email}`;
  const user = rows[0];
  // Hash even when the account does not exist, so the response time does not reveal which emails are registered.
  const ok = user ? await verifyPassword(password, user.password_hash) : (await hashPassword(password), false);
  if (!ok) {
    await db`insert into login_attempts (email) values (${email})`;
    return json({ message: "That email and password do not match." }, 401);
  }
  await db`delete from login_attempts where email = ${email}`;
  await startSession(user.id);
  return json({ ok: true });
}
