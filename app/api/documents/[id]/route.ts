import { json, requireSession } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";

/** Serves a stored document to members of the workspace that owns it, as a download. */
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const s = await requireSession();
  if (s instanceof Response) return s;
  const { id } = await ctx.params;
  const rows = await sql()`
    select name, content_type, encode(bytes, 'base64') as b64 from documents
    where workspace_id = ${s.workspace.id} and id = ${id}`;
  const doc = rows[0];
  if (!doc) return json({ message: "Document not found." }, 404);
  const safeName = String(doc.name).replace(/[^A-Za-z0-9._ -]/g, "_");
  return new Response(Buffer.from(doc.b64, "base64"), {
    headers: {
      "Content-Type": doc.content_type,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
