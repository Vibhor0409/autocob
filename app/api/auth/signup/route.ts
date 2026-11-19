import { randomUUID } from "node:crypto";
import { cleanEmail, cleanText, hashPassword, json, sameOrigin, sha256, startSession } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";

export async function POST(request: Request) {
  if (!(await sameOrigin())) return json({ message: "Request refused." }, 403);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = cleanEmail(body.email);
  const name = cleanText(body.name, 80);
  const password = typeof body.password === "string" ? body.password : "";
  const workspaceName = cleanText(body.workspaceName, 80);
  const invite = cleanText(body.invite, 100);

  if (!name) return json({ message: "Enter your name." }, 400);
  if (!email) return json({ message: "Enter a valid work email." }, 400);
  if (password.length < 10 || password.length > 200) {
    return json({ message: "Choose a password of at least 10 characters." }, 400);
  }
  if (!invite && !workspaceName) return json({ message: "Enter your clinic or company name." }, 400);

  const db = sql();
  let joinWorkspace: string | null = null;
  if (invite) {
    const rows = await db`select workspace_id from invites where code_hash = ${sha256(invite)} and expires_at > now()`;
    if (!rows[0]) return json({ message: "That invite link has expired. Ask your teammate for a new one." }, 400);
    joinWorkspace = rows[0].workspace_id;
  }
  const existing = await db`select 1 from users where lower(email) = ${email}`;
  if (existing[0]) return json({ message: "An account with that email already exists. Sign in instead." }, 409);

  const userId = randomUUID();
  const workspaceId = joinWorkspace ?? randomUUID();
  const hash = await hashPassword(password);
  try {
    await db.transaction([
      db`insert into users (id, email, name, password_hash) values (${userId}, ${email}, ${name}, ${hash})`,
      ...(joinWorkspace ? [] : [db`insert into workspaces (id, name) values (${workspaceId}, ${workspaceName})`]),
      db`insert into memberships (user_id, workspace_id, role) values (${userId}, ${workspaceId}, ${joinWorkspace ? "member" : "owner"})`,
    ]);
  } catch {
    return json({ message: "The account could not be created. Try again." }, 500);
  }
  await startSession(userId);
  return json({ ok: true });
}
