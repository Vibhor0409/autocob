import { json, requireSession } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";
import { cleanCase } from "@/lib/validate";

const MAX_CASES = 2000;

export async function GET() {
  const s = await requireSession();
  if (s instanceof Response) return s;
  const rows = await sql()`select data, version from cases where workspace_id = ${s.workspace.id} order by updated_at desc limit ${MAX_CASES}`;
  return json({ cases: rows.map((r) => ({ case: r.data, version: r.version })) });
}

export async function POST(request: Request) {
  const s = await requireSession({ write: true });
  if (s instanceof Response) return s;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const c = cleanCase(body.case);
  if (!c) return json({ message: "The case is missing a patient, carrier or claim number." }, 400);
  const count = await sql()`select count(*)::int as n from cases where workspace_id = ${s.workspace.id}`;
  if ((count[0]?.n ?? 0) >= MAX_CASES) return json({ message: "This workspace has reached its case limit." }, 409);
  const rows = await sql()`
    insert into cases (workspace_id, id, data, updated_by) values (${s.workspace.id}, ${c.id}, ${JSON.stringify(c)}::jsonb, ${s.user.id})
    on conflict (workspace_id, id) do nothing returning version`;
  if (!rows[0]) return json({ message: "A case with that id already exists." }, 409);
  return json({ case: c, version: rows[0].version }, 201);
}
