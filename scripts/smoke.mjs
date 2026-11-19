// End-to-end check of the product's server: accounts, workspace isolation, saving with version
// checks, stored files, invites, and (with --agent) one live document read.
// Run with: node scripts/smoke.mjs [base url] [--agent]
// It creates throwaway accounts named smoke-…@autocob.test and deletes them afterwards.
import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3320").replace(/\/$/, "");
const withAgent = process.argv.includes("--agent");
const stamp = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

class Client {
  cookie = "";
  async call(method, path, body, raw = false) {
    const headers = { Origin: base };
    if (this.cookie) headers.Cookie = this.cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers, body: payload, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("autocob_session=")) this.cookie = c.split(";")[0];
    if (raw) return res;
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
}

const sampleCase = (id) => ({
  id,
  patient: { name: "Case ref T-1", dob: "" },
  clinic: "Smoke Clinic",
  injuryDate: "2026-10-01",
  accident: "Auto accident",
  primary: { carrier: "Test Auto", coverage: "PIP", claimNumber: "T-100", limitCents: 500000, adjuster: { name: "", phone: "", email: "" }, claimVerified: true },
  secondary: { payer: "Test Health", memberId: "M-1", timelyFilingDays: 180 },
  visits: [{ id: "v1", date: "2026-10-05", service: "Evaluation", billedCents: 30000 }],
  payments: [],
  documents: [],
  timeline: [],
});

const a = new Client();
const b = new Client();
const c = new Client();
const emailA = `smoke-a-${stamp}@autocob.test`;
const emailB = `smoke-b-${stamp}@autocob.test`;
const emailC = `smoke-c-${stamp}@autocob.test`;
const password = `Smoke-${stamp}-pass!`;

try {
  let r = await new Client().call("GET", "/api/cases");
  check("signed-out request is refused", r.status === 401);

  r = await a.call("POST", "/api/auth/signup", { name: "Smoke A", email: emailA, password: "short", workspaceName: "Smoke Clinic A" });
  check("short password is rejected", r.status === 400, r.body.message);
  r = await a.call("POST", "/api/auth/signup", { name: "Smoke A", email: emailA, password, workspaceName: "Smoke Clinic A" });
  check("sign-up creates a workspace", r.status === 200 && Boolean(a.cookie));
  r = await new Client().call("POST", "/api/auth/signup", { name: "Dup", email: emailA, password, workspaceName: "X" });
  check("duplicate email is rejected", r.status === 409);

  r = await a.call("GET", "/api/me");
  check("profile shows owner and workspace", r.body.role === "owner" && r.body.workspace?.name === "Smoke Clinic A");

  r = await a.call("POST", "/api/cases", { case: sampleCase("smoke-1") });
  check("case is created", r.status === 201 && r.body.version === 1);
  r = await a.call("POST", "/api/cases", { case: { id: "bad" } });
  check("incomplete case is rejected", r.status === 400);

  const edited = sampleCase("smoke-1");
  edited.visits.push({ id: "v2", date: "2026-10-12", service: "<script>x</script>", billedCents: 30000, junk: "dropped" });
  r = await a.call("PUT", "/api/cases/smoke-1", { case: edited, version: 1 });
  check("case saves and version advances", r.status === 200 && r.body.version === 2);
  r = await a.call("PUT", "/api/cases/smoke-1", { case: edited, version: 1 });
  check("stale save is refused with the current copy", r.status === 409 && r.body.version === 2 && r.body.case?.visits?.length === 2);
  r = await a.call("GET", "/api/cases");
  const stored = r.body.cases?.[0]?.case;
  check("unknown fields are dropped on save", stored && !("junk" in stored.visits[1]));

  r = await a.call("POST", "/api/cases/sample");
  r = await a.call("GET", "/api/cases");
  check("practice cases are added", r.body.cases?.length === 5);

  const pdf = readFileSync(join(root, "public", "samples", "alvarez-exhaustion-letter.pdf"));
  const form = new FormData();
  form.set("docId", "doc-smoke");
  form.set("file", new File([pdf], "letter.pdf", { type: "application/pdf" }));
  r = await a.call("POST", "/api/cases/smoke-1/documents", form);
  check("document file is stored", r.status === 201);
  let res = await a.call("GET", "/api/documents/doc-smoke", undefined, true);
  const got = Buffer.from(await res.arrayBuffer());
  check("stored file downloads intact", res.status === 200 && got.equals(pdf) && /attachment/.test(res.headers.get("content-disposition") ?? ""));
  const exe = new FormData();
  exe.set("docId", "doc-bad");
  exe.set("file", new File(["hello"], "x.html", { type: "text/html" }));
  r = await a.call("POST", "/api/cases/smoke-1/documents", exe);
  check("non-document file types are refused", r.status === 415);

  // A second workspace must see none of it.
  await b.call("POST", "/api/auth/signup", { name: "Smoke B", email: emailB, password, workspaceName: "Smoke Clinic B" });
  r = await b.call("GET", "/api/cases");
  check("another workspace sees no cases", r.status === 200 && r.body.cases?.length === 0);
  r = await b.call("PUT", "/api/cases/smoke-1", { case: edited, version: 2 });
  check("another workspace cannot edit the case", r.status === 404);
  res = await b.call("GET", "/api/documents/doc-smoke", undefined, true);
  check("another workspace cannot download the file", res.status === 404);
  r = await b.call("DELETE", "/api/cases/smoke-1");
  r = await a.call("GET", "/api/cases");
  check("another workspace cannot delete the case", r.body.cases?.some((x) => x.case.id === "smoke-1"));

  // Invite a teammate into workspace A.
  r = await a.call("POST", "/api/workspace/invite");
  const invite = new URL(r.body.url ?? "http://x/").searchParams.get("invite");
  check("invite link is created", Boolean(invite));
  r = await c.call("POST", "/api/auth/signup", { name: "Smoke C", email: emailC, password, invite });
  r = await c.call("GET", "/api/cases");
  check("invited teammate sees the workspace's cases", r.body.cases?.length === 5);
  r = await c.call("PATCH", "/api/me", { name: "Hijack" });
  check("member cannot rename the workspace", r.status === 403);

  // Sign out and back in.
  await a.call("POST", "/api/auth/logout");
  r = await a.call("GET", "/api/cases");
  check("signed-out session stops working", r.status === 401);
  r = await a.call("POST", "/api/auth/login", { email: emailA, password: "wrong-password-1" });
  check("wrong password is refused", r.status === 401);
  r = await a.call("POST", "/api/auth/login", { email: emailA, password });
  check("sign-in works", r.status === 200);

  // Cross-site request with a valid cookie must be refused.
  const forged = await fetch(base + "/api/cases/smoke-1", { method: "DELETE", headers: { Cookie: a.cookie, Origin: "https://evil.example" } });
  check("cross-site request is refused", forged.status === 403);

  r = await new Client().call("POST", "/api/agent/letter", { case: {} });
  check("agent refuses signed-out callers", r.status === 401);

  if (withAgent) {
    const f = new FormData();
    f.set("case", JSON.stringify({ caseId: "alvarez", patient: "Maria Alvarez", clinic: "Smoke Clinic A", carrier: "Bayline Mutual Auto", coverage: "PIP", claimNumber: "BMA-26-0417723", limitCents: 1000000 }));
    f.set("file", new File([pdf], "alvarez-exhaustion-letter.pdf", { type: "application/pdf" }));
    r = await a.call("POST", "/api/agent/read", f);
    for (let i = 0; i < 6 && r.status === 429; i++) {
      await new Promise((x) => setTimeout(x, 20000));
      r = await a.call("POST", "/api/agent/read", f);
    }
    check("agent task starts for a signed-in user", r.status === 200 && Boolean(r.body.task), r.body.message);
    if (r.body.task) {
      let view = { status: "working" };
      for (let i = 0; i < 40 && view.status === "working"; i++) {
        await new Promise((x) => setTimeout(x, 4000));
        view = (await a.call("GET", `/api/agent/task?t=${encodeURIComponent(r.body.task)}`)).body;
      }
      check("live agent reads the letter", view.status === "done" && view.extraction?.exhausted === true && view.extraction?.claim_number === "BMA-26-0417723", view.message);
    }
    r = await a.call("GET", "/api/me");
    check("agent usage is counted", r.body.agent?.usedToday === 1);
  }

  r = await a.call("DELETE", "/api/cases/smoke-1");
  res = await a.call("GET", "/api/documents/doc-smoke", undefined, true);
  check("deleting a case removes its stored files", r.status === 200 && res.status === 404);
} finally {
  let url = process.env.DATABASE_URL;
  if (!url && existsSync(join(root, ".env.local"))) {
    const line = readFileSync(join(root, ".env.local"), "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
    if (line) url = line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  }
  if (url) {
    const sql = neon(url);
    await sql`delete from workspaces where id in (select m.workspace_id from memberships m join users u on u.id = m.user_id where u.email like 'smoke-%@autocob.test')`;
    await sql`delete from users where email like 'smoke-%@autocob.test'`;
    await sql`delete from login_attempts where email like 'smoke-%@autocob.test'`;
    console.log("Cleaned up the throwaway accounts.");
  }
}

const failed = results.filter((x) => !x).length;
console.log(`${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
