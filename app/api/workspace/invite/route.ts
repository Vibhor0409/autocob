import { json, newToken, requireSession, sha256 } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";

/** Creates a 7-day invite link. Only its hash is stored, so the link cannot be recovered later. */
export async function POST(request: Request) {
  const s = await requireSession({ write: true });
  if (s instanceof Response) return s;
  const code = newToken();
  const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await sql()`insert into invites (code_hash, workspace_id, created_by, expires_at) values (${sha256(code)}, ${s.workspace.id}, ${s.user.id}, ${expires})`;
  return json({ url: `${new URL(request.url).origin}/signup?invite=${code}`, expiresOn: expires.slice(0, 10) });
}
