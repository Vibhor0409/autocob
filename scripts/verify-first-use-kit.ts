// Runs the first-use test kit through a live AutoCOB site exactly as a tester would: signs up a
// throwaway workspace, creates the case, has the live agent read each document in order, and
// applies the same approval rules the app uses. Prints the state after every step.
// Run with: node scripts/verify-first-use-kit.ts [base url]
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { proposeChanges } from "../lib/apply.ts";
import { computeLedger, formatUsd } from "../lib/ledger.ts";
import type { AccidentCase } from "../lib/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv.find((a) => a.startsWith("http")) ?? "https://autocob.vercel.app").replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);
const stamp = Date.now().toString(36);
let cookie = "";
let failures = 0;

async function call(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Origin: base };
  if (cookie) headers.Cookie = cookie;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + path, { method, headers, body: payload });
  for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("autocob_session=")) cookie = c.split(";")[0];
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}
const expect = (label: string, ok: boolean) => {
  if (!ok) failures += 1;
  console.log(`   ${ok ? "as expected" : "NOT AS EXPECTED"}: ${label}`);
};

let c: AccidentCase = {
  id: `case-${stamp}`,
  patient: { name: "J.R. chart 20417", dob: "" },
  clinic: "Northside Spine and Rehab",
  injuryDate: "2026-08-03",
  accident: "Auto accident",
  primary: { carrier: "Granite State Auto", coverage: "PIP", claimNumber: "GSA-26-118842", limitCents: 500_000, adjuster: { name: "", phone: "", email: "" }, claimVerified: false },
  secondary: { payer: "Meridian Health PPO", memberId: "MHP-55172093", timelyFilingDays: 60 },
  visits: ["2026-08-24", "2026-08-31", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"].map((date, i) => ({ id: `v${i + 1}`, date, service: "Spinal manipulation and therapy", billedCents: 25_000 })),
  payments: [],
  documents: [],
  timeline: [],
};

async function read(file: string) {
  const bytes = readFileSync(join(root, "first-use-test", "documents", file));
  const form = new FormData();
  form.set("file", new File([bytes], file, { type: "application/pdf" }));
  form.set("case", JSON.stringify({ caseId: c.id, patient: c.patient.name, clinic: c.clinic, carrier: c.primary.carrier, coverage: c.primary.coverage, claimNumber: c.primary.claimNumber, limitCents: c.primary.limitCents }));
  if (c.agentThread) form.set("thread", c.agentThread);
  let start = await call("POST", "/api/agent/read", form);
  for (let i = 0; i < 8 && (start.status === 429 || start.status === 409); i++) {
    await new Promise((r) => setTimeout(r, 20_000));
    start = await call("POST", "/api/agent/read", form);
  }
  if (!start.body.task) throw new Error(`could not start: ${start.body.message}`);
  let view: Record<string, any> = { status: "working" };
  const t0 = Date.now();
  while (view.status === "working" && Date.now() - t0 < 240_000) {
    await new Promise((r) => setTimeout(r, 4000));
    view = (await call("GET", `/api/agent/task?t=${encodeURIComponent(start.body.task)}`)).body;
  }
  if (view.status !== "done") throw new Error(`agent did not finish: ${view.message}`);
  const proposal = proposeChanges(c, view.extraction, file, today);
  console.log(`\n${file}  (${Math.round((Date.now() - t0) / 1000)}s, confidence ${view.extraction.confidence})`);
  if (proposal.blocked) console.log(`   REFUSED: ${proposal.blocked}`);
  else for (const line of proposal.changes) console.log(`   will: ${line}`);
  if (!proposal.blocked) c = { ...proposal.next, agentThread: view.thread ?? c.agentThread };
  const l = computeLedger(c, today);
  console.log(`   ledger: remaining ${formatUsd(l.remainingCents)}, stuck ${formatUsd(l.blockedCents)}, ready ${formatUsd(l.secondaryBalanceCents - l.blockedCents)} | next step: ${l.nextAction.title}`);
  return { proposal, ledger: l };
}

try {
  const signup = await call("POST", "/api/auth/signup", { name: "Kit Check", email: `smoke-kit-${stamp}@autocob.test`, password: `Kit-${stamp}-${crypto.randomUUID().slice(0, 8)}`, workspaceName: c.clinic });
  if (signup.status !== 200) throw new Error(`sign-up failed: ${signup.body.message}`);
  const created = await call("POST", "/api/cases", { case: c });
  if (created.status !== 201) throw new Error(`case not created: ${created.body.message}`);
  let l = computeLedger(c, today);
  console.log(`Case entered by hand: 6 visits, ${formatUsd(l.billedCents)} billed | next step: ${l.nextAction.title}`);
  expect("starts at Verify the claim", l.nextAction.kind === "verify_claim");

  let r = await read("1-claim-acknowledgement.pdf");
  expect("claim confirmed and adjuster set", c.primary.claimVerified && c.primary.adjuster.name.includes("Whitfield"));

  r = await read("2-carrier-eob.pdf");
  expect("four clinic payments recorded, $4,000.00 remaining", c.payments.filter((p) => p.visitId).length === 4 && r.ledger.remainingCents === 400_000);

  r = await read("3-payout-log.pdf");
  expect("two other-provider payments added, limit reached, $500.00 stuck", c.payments.filter((p) => !p.visitId).length === 2 && r.ledger.remainingCents === 0 && r.ledger.blockedCents === 50_000 && r.ledger.nextAction.kind === "request_exhaustion_letter");

  r = await read("5-letter-for-another-patient.pdf");
  expect("the misfiled letter is refused", Boolean(r.proposal.blocked));

  r = await read("4-exhaustion-letter.pdf");
  expect("letter filed, $500.00 ready, packet is the next step", r.ledger.blockedCents === 0 && r.ledger.secondaryBalanceCents === 50_000 && r.ledger.nextAction.kind === "assemble_packet");
  const open = r.ledger.lines.filter((x) => x.status === "ready_for_secondary");
  console.log(`\nFile-by dates for the two open visits: ${open.map((x) => `${x.visit.date} -> ${x.filingDeadline} (${x.daysToDeadline}d)`).join("; ")}`);
} catch (err) {
  failures += 1;
  console.log("STOPPED:", err instanceof Error ? err.message : err);
} finally {
  const line = readFileSync(join(root, ".env.local"), "utf8").split("\n").find((x) => x.startsWith("DATABASE_URL="));
  if (line) {
    const sql = neon(line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, ""));
    await sql`delete from workspaces where id in (select m.workspace_id from memberships m join users u on u.id = m.user_id where u.email like 'smoke-%@autocob.test')`;
    await sql`delete from users where email like 'smoke-%@autocob.test'`;
  }
  console.log(`\n${failures === 0 ? "Kit verified: every step behaved as the test script says." : `${failures} step(s) did not behave as expected.`}`);
  process.exit(failures ? 1 : 0);
}
