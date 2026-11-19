// Live check of the case agent, straight against HarnessRouter (no browser, no app routes).
// Uploads one sample document, runs READ_DOCUMENT, and prints what came back.
// Run with: node scripts/live-check.ts [sample file]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { API_BASE, HarnessRouter, HRError, UHP_VERSION, answerText, loadApiKey } from "../lib/server/harnessrouter.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = loadApiKey(root);
const harnessId = JSON.parse(readFileSync(join(root, "harnessrouter.json"), "utf8")).harness_id as string;
const name = process.argv[2] ?? "alvarez-exhaustion-letter.pdf";
const hr = new HarnessRouter({ apiKey: key });

try {
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("file", new File([readFileSync(join(root, "public", "samples", name))], name, { type: "application/pdf" }), name);
  const up = await fetch(`${API_BASE}/v1/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "UHP-Version": UHP_VERSION, Accept: "application/json" },
    body: form,
  });
  const upBody = await up.json();
  console.log("upload:", up.status, upBody.id ? "file id received" : JSON.stringify(upBody));
  if (!up.ok) process.exit(1);

  const started = await hr.startBackground({
    harnessId,
    user: "autocob-live-check",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `READ_DOCUMENT\n\nCase facts (from the clinic's records):\nPatient: Maria Alvarez\nPrimary carrier: Bayline Mutual Auto\nCoverage: PIP\nClaim number: BMA-26-0417723\nAttached file: ${name}`,
          },
          { type: "input_file", file_id: upBody.id },
        ],
      },
    ],
    maxStep: 60,
    timeoutSeconds: 600,
    maxCostUsd: 1,
  });
  console.log("started:", started.status);
  const t0 = Date.now();
  const done = await hr.waitForResponse(started.id, { timeoutMs: 600_000 });
  console.log("finished:", done.status, `${Math.round((Date.now() - t0) / 1000)}s`, "model:", done.model ?? done.served_model);
  if (done.error) console.log("error:", JSON.stringify(done.error));
  if (done.incomplete_details) console.log("incomplete:", JSON.stringify(done.incomplete_details));
  console.log("answer:", answerText(done).slice(0, 400));
  const sessionId = done.metadata?.session_id ?? started.metadata?.session_id;
  if (sessionId) {
    const files = await hr.listFiles(sessionId);
    console.log("files:", files.map((f) => `${f.path} (${f.bytes}b)`).join(", ") || "none");
    const ex = files.filter((f) => f.path === "out/extraction.json").pop();
    if (ex) console.log("extraction:", new TextDecoder().decode((await hr.fetchFile(sessionId, ex.id || ex.file_id)).bytes));
  }
} catch (err) {
  if (err instanceof HRError) console.log("HRError:", err.status, err.code, err.message, err.param ?? "");
  else console.log("error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
