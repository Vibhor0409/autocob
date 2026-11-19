import { plainError, readTask } from "@/lib/server/agent";
import { requireSession } from "@/lib/server/auth";

export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!token || token.length > 2000) return Response.json({ message: "Unknown task." }, { status: 404 });
  try {
    const view = await readTask(token);
    if (!view) return Response.json({ message: "Unknown task." }, { status: 404 });
    return Response.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const e = plainError(err);
    return Response.json({ message: e.message }, { status: e.status });
  }
}
