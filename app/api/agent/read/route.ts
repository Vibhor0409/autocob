import { plainError, startTask } from "@/lib/server/agent";
import { buildFacts } from "@/lib/server/facts";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: "Send the document as a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ message: "Choose a document to read." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { message: "That file is over 10 MB. Split it or scan at a lower resolution." },
      { status: 413 },
    );
  }
  if (!ALLOWED.has(file.type)) {
    return Response.json({ message: "Upload a PDF, PNG or JPEG." }, { status: 415 });
  }
  let summary: unknown = null;
  try {
    summary = JSON.parse(String(form.get("case") ?? ""));
  } catch {
    // handled by buildFacts returning null
  }
  const facts = buildFacts(summary, false);
  if (!facts) return Response.json({ message: "The case details were incomplete." }, { status: 400 });
  const thread = form.get("thread");
  const safeName = file.name.replace(/[\r\n]+/g, " ").slice(0, 120);

  try {
    const task = await startTask({
      job: "READ_DOCUMENT",
      facts: `${facts.text}\nAttached file: ${safeName}`,
      file,
      thread: typeof thread === "string" && thread ? thread : undefined,
    });
    return Response.json({ task });
  } catch (err) {
    const e = plainError(err);
    return Response.json({ message: e.message }, { status: e.status });
  }
}
