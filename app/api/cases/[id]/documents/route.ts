import { json, requireSession } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

/** Stores an approved document's file with its case. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/documents">) {
  const s = await requireSession({ write: true });
  if (s instanceof Response) return s;
  const { id: caseId } = await ctx.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const docId = String(form?.get("docId") ?? "").replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 80);
  if (!(file instanceof File) || !docId) return json({ message: "The file could not be read." }, 400);
  if (file.size === 0 || file.size > MAX_BYTES) return json({ message: "Files must be under 10 MB." }, 413);
  if (!ALLOWED.has(file.type)) return json({ message: "Upload a PDF, PNG or JPEG." }, 415);

  const owns = await sql()`select 1 from cases where workspace_id = ${s.workspace.id} and id = ${caseId}`;
  if (!owns[0]) return json({ message: "This case no longer exists." }, 404);
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  await sql()`
    insert into documents (workspace_id, id, case_id, name, content_type, size, bytes, created_by)
    values (${s.workspace.id}, ${docId}, ${caseId}, ${file.name.slice(0, 200)}, ${file.type}, ${file.size}, decode(${b64}, 'base64'), ${s.user.id})
    on conflict (workspace_id, id) do nothing`;
  return json({ ok: true }, 201);
}
