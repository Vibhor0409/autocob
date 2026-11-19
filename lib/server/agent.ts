// Server-only bridge between AutoCOB and its HarnessRouter case agent.
// The browser never sees the API key, a Harness ID, or an upstream response or session id:
// task handles are encrypted here and opaque outside this module.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  API_BASE,
  HarnessRouter,
  HRError,
  TERMINAL_STATUSES,
  UHP_VERSION,
  answerText,
  loadApiKey,
  type SessionFile,
} from "./harnessrouter";
import type { Extraction } from "../types";

const WORKSPACE_USER = "autocob-demo-clinic"; // one shared demo workspace; replace with the signed-in staff id
const LIMITS = { maxStep: 60, timeoutSeconds: 600, maxCostUsd: 1 };

export type Job = "READ_DOCUMENT" | "WRITE_LETTER";

interface Handle {
  r: string; // response id
  s: string; // session id
  j: Job;
}

function apiKey(): string | null {
  try {
    return loadApiKey(process.cwd());
  } catch {
    return null;
  }
}

function harnessId(): string | null {
  const env = process.env.HR_HARNESS_ID?.trim();
  if (env) return env;
  const file = join(process.cwd(), "harnessrouter.json");
  if (!existsSync(file)) return null;
  try {
    const id = JSON.parse(readFileSync(file, "utf8")).harness_id;
    return typeof id === "string" && id.startsWith("chrn_") ? id : null;
  } catch {
    return null;
  }
}

export function agentConnected(): boolean {
  return Boolean(apiKey() && harnessId());
}

function cipherKey(): Buffer {
  const secret = process.env.AUTOCOB_SECRET?.trim() || apiKey();
  if (!secret) throw new Error("agent_not_connected");
  return createHash("sha256").update("autocob-handle:" + secret).digest();
}

function seal(h: Handle): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(h), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

function open(token: string): Handle | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const d = createDecipheriv("aes-256-gcm", cipherKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const h = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
    return typeof h.r === "string" && typeof h.s === "string" ? (h as Handle) : null;
  } catch {
    return null;
  }
}

async function uploadFile(key: string, file: File): Promise<string> {
  const form = new FormData();
  form.set("purpose", "user_data");
  form.set("file", file, file.name);
  const res = await fetch(`${API_BASE}/v1/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "UHP-Version": UHP_VERSION, Accept: "application/json" },
    body: form,
    redirect: "manual",
  });
  if (!res.ok) throw new HRError(res.status, await res.json().catch(() => null), res.headers.get("retry-after"));
  const id = (await res.json()).id;
  if (typeof id !== "string") throw new Error("upload_failed");
  return id;
}

export interface StartArgs {
  job: Job;
  /** Case facts as plain lines, built by the route from validated fields. */
  facts: string;
  file?: File;
  /** Continue this case's existing agent session when present. */
  thread?: string;
}

export async function startTask(a: StartArgs): Promise<string> {
  const key = apiKey();
  const harness = harnessId();
  if (!key || !harness) throw new Error("agent_not_connected");
  const hr = new HarnessRouter({ apiKey: key });
  const prior = a.thread ? open(a.thread) : null;

  const text = `${a.job}\n\n${a.facts}`;
  const content: unknown[] = [{ type: "input_text", text }];
  if (a.file) content.push({ type: "input_file", file_id: await uploadFile(key, a.file) });

  const res = await hr.startBackground({
    harnessId: harness,
    input: [{ role: "user", content }],
    user: WORKSPACE_USER,
    previousResponseId: prior?.r,
    sessionId: prior?.s,
    idempotencyKey: randomUUID(),
    ...LIMITS,
  });
  const sessionId = res.metadata?.session_id || prior?.s;
  if (!res.id || !sessionId) throw new Error("task_not_started");
  return seal({ r: res.id, s: sessionId, j: a.job });
}

export interface TaskView {
  status: "working" | "done" | "failed" | "incomplete" | "out_of_scope";
  message?: string;
  extraction?: Extraction;
  letter?: string;
  /** Handle to continue this case's session on the next task. */
  thread?: string;
}

function newest(files: SessionFile[], path: string): SessionFile | undefined {
  return files.filter((f) => f.path === path).pop();
}

async function readText(hr: HarnessRouter, sessionId: string, f: SessionFile, max = 200_000): Promise<string> {
  if (f.bytes > max) throw new Error("file_too_large");
  const { bytes } = await hr.fetchFile(sessionId, f.id || f.file_id);
  return new TextDecoder().decode(bytes);
}

export async function readTask(token: string): Promise<TaskView | null> {
  const h = open(token);
  if (!h) return null;
  const key = apiKey();
  if (!key) throw new Error("agent_not_connected");
  const hr = new HarnessRouter({ apiKey: key });
  const res = await hr.getResponse(h.r);
  if (!TERMINAL_STATUSES.has(res.status)) return { status: "working" };

  const thread = seal({ r: res.id, s: h.s, j: h.j });
  if (res.status === "failed" || res.status === "cancelled") {
    // Upstream text never reaches the browser; only which plain sentence to show is decided from it.
    const upstream = JSON.stringify(res.error ?? "").toLowerCase();
    const message = /refused|401|unauthorized|key/.test(upstream)
      ? "The agent's model provider refused the request. The workspace owner needs to check the model key saved in HarnessRouter. Nothing was changed."
      : /quota|credit|balance|402/.test(upstream)
        ? "The agent's usage credit has run out. Nothing was changed."
        : "The agent could not finish this task. Nothing was changed.";
    return { status: "failed", message, thread };
  }
  const answer = answerText(res).trim();
  if (/^role_mismatch/i.test(answer)) {
    return { status: "out_of_scope", message: "That is outside what the case agent does.", thread };
  }

  // Prefer what this turn changed; fall back to the whole session.
  let files = await hr.listFiles(h.s, { changed: true });
  const want = h.j === "READ_DOCUMENT" ? "out/extraction.json" : "out/letter.md";
  if (!newest(files, want)) files = await hr.listFiles(h.s);
  const file = newest(files, want);
  if (!file) {
    return {
      status: res.status === "incomplete" ? "incomplete" : "failed",
      message: "The agent finished without producing a result. Try again.",
      thread,
    };
  }
  const body = await readText(hr, h.s, file);
  const message = answer.split("\n")[0].slice(0, 300);
  if (h.j === "WRITE_LETTER") return { status: "done", message, letter: body.trim(), thread };
  try {
    return { status: "done", message, extraction: cleanExtraction(JSON.parse(body)), thread };
  } catch {
    return { status: "failed", message: "The agent's reading could not be understood. Try again.", thread };
  }
}

const KINDS = ["accident_report", "primary_eob", "payout_log", "exhaustion_letter", "adjuster_letter", "other"] as const;
const isCents = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e10;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown, max = 200): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

/** Agent output is untrusted input: keep only fields of the expected type. */
export function cleanExtraction(raw: unknown): Extraction {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const adj = (o.adjuster && typeof o.adjuster === "object" ? o.adjuster : {}) as Record<string, unknown>;
  const kind = KINDS.find((k) => k === o.document_kind) ?? "other";
  const payments = Array.isArray(o.payments)
    ? o.payments
        .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
        .filter((p) => isDate(p.date) && isCents(p.amount_cents))
        .slice(0, 200)
        .map((p) => ({
          date: p.date as string,
          amount_cents: p.amount_cents as number,
          payee: str(p.payee) ?? "Unknown payee",
          date_of_service: isDate(p.date_of_service) ? p.date_of_service : undefined,
        }))
    : undefined;
  return {
    document_kind: kind,
    carrier: str(o.carrier),
    claim_number: str(o.claim_number, 60),
    policy_limit_cents: isCents(o.policy_limit_cents) ? o.policy_limit_cents : undefined,
    total_paid_cents: isCents(o.total_paid_cents) ? o.total_paid_cents : undefined,
    remaining_cents: isCents(o.remaining_cents) ? o.remaining_cents : undefined,
    exhausted: typeof o.exhausted === "boolean" ? o.exhausted : undefined,
    exhaustion_date: isDate(o.exhaustion_date) ? o.exhaustion_date : undefined,
    adjuster: { name: str(adj.name), phone: str(adj.phone, 40), email: str(adj.email, 120) },
    payments,
    confidence: o.confidence === "high" || o.confidence === "medium" ? o.confidence : "low",
    notes: str(o.notes, 600),
  };
}

/** A plain sentence for any failure; upstream messages and ids never leave the server. */
export function plainError(err: unknown): { status: number; message: string } {
  if (err instanceof Error && err.message === "agent_not_connected") {
    return { status: 503, message: "The case agent is not connected yet." };
  }
  if (err instanceof HRError) {
    if (err.status === 429) return { status: 429, message: "The agent is busy. Try again in a minute." };
    if (err.status === 402) return { status: 402, message: "The agent's usage credit has run out." };
    if (err.status === 409) return { status: 409, message: "The agent is still working on this case. Wait for it to finish." };
  }
  return { status: 502, message: "The agent could not be reached. Nothing was changed." };
}
