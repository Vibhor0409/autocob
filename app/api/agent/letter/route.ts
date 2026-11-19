import { plainError, startTask } from "@/lib/server/agent";
import { json, requireSession, spendAgentRun } from "@/lib/server/auth";
import { buildFacts } from "@/lib/server/facts";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await requireSession({ write: true });
  if (session instanceof Response) return session;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "The request could not be read." }, { status: 400 });
  }
  const facts = buildFacts(body.case, true);
  if (!facts) return Response.json({ message: "The case details were incomplete." }, { status: 400 });
  if (!(await spendAgentRun(session, "WRITE_LETTER"))) {
    return json({ message: "This workspace has used today's agent allowance. It resets within 24 hours." }, 402);
  }
  try {
    const task = await startTask({
      user: session.user.id,
      job: "WRITE_LETTER",
      facts: facts.text,
      thread: typeof body.thread === "string" && body.thread ? body.thread : undefined,
    });
    return Response.json({ task });
  } catch (err) {
    const e = plainError(err);
    return Response.json({ message: e.message }, { status: e.status });
  }
}
