import { json, requireSession } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";
import { SAMPLE_CASES } from "@/lib/sample-cases.ts";

/** Adds the four fictional practice cases to the workspace. Existing cases are left alone. */
export async function POST() {
  const s = await requireSession({ write: true });
  if (s instanceof Response) return s;
  const db = sql();
  await db.transaction(
    SAMPLE_CASES.map(
      (c) => db`insert into cases (workspace_id, id, data, updated_by) values (${s.workspace.id}, ${c.id}, ${JSON.stringify({ ...c, clinic: s.workspace.name })}::jsonb, ${s.user.id})
        on conflict (workspace_id, id) do nothing`,
    ),
  );
  return json({ ok: true });
}
