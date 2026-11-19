import { agentConnected } from "@/lib/server/agent";
import { AGENT_DAILY_LIMIT, agentRunsToday, cleanText, json, requireSession } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";

export async function GET() {
  const s = await requireSession();
  if (s instanceof Response) return s;
  const members = await sql()`
    select u.name, u.email, m.role from memberships m join users u on u.id = m.user_id
    where m.workspace_id = ${s.workspace.id} order by m.created_at`;
  return json({
    user: { name: s.user.name, email: s.user.email },
    workspace: { name: s.workspace.name },
    role: s.role,
    members,
    agent: { connected: agentConnected(), usedToday: await agentRunsToday(s.workspace.id), dailyLimit: AGENT_DAILY_LIMIT },
  });
}

/** Rename the workspace. Owners only. */
export async function PATCH(request: Request) {
  const s = await requireSession({ write: true });
  if (s instanceof Response) return s;
  if (s.role !== "owner") return json({ message: "Only the workspace owner can rename it." }, 403);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = cleanText(body.name, 80);
  if (!name) return json({ message: "Enter a name." }, 400);
  await sql()`update workspaces set name = ${name} where id = ${s.workspace.id}`;
  return json({ ok: true });
}
