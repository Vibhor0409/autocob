import { json, requireSession } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";
import { cleanCase } from "@/lib/validate";

/** Save a case. The version must match what the browser loaded, so two people cannot silently overwrite each other. */
export async function PUT(request: Request, ctx: RouteContext<"/api/cases/[id]">) {
  const s = await requireSession({ write: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const c = cleanCase(body.case);
  const version = Number(body.version);
  if (!c || c.id !== id || !Number.isInteger(version)) return json({ message: "The case could not be read." }, 400);
  const rows = await sql()`
    update cases set data = ${JSON.stringify(c)}::jsonb, version = version + 1, updated_by = ${s.user.id}, updated_at = now()
    where workspace_id = ${s.workspace.id} and id = ${id} and version = ${version} returning version`;
  if (!rows[0]) {
    const current = await sql()`select data, version from cases where workspace_id = ${s.workspace.id} and id = ${id}`;
    if (!current[0]) return json({ message: "This case no longer exists." }, 404);
    return json(
      { message: "A teammate changed this case. It has been reloaded with their changes.", case: current[0].data, version: current[0].version },
      409,
    );
  }
  return json({ version: rows[0].version });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/cases/[id]">) {
  const s = await requireSession({ write: true });
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  await sql().transaction([
    sql()`delete from documents where workspace_id = ${s.workspace.id} and case_id = ${id}`,
    sql()`delete from cases where workspace_id = ${s.workspace.id} and id = ${id}`,
  ]);
  return json({ ok: true });
}
