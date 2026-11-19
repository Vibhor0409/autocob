// Captures product screens for the launch video. The two agent readings are replayed from the
// verified live run of the same first-use test documents, so capture works without agent credit.
// Usage: PLAYWRIGHT_CORE=<path> node scripts/capture-shots.mjs [base url]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "http://localhost:3320").replace(/\/$/, "");
const out = join(root, "brag-output", "shots");
const docs = join(root, "first-use-test", "documents");
const stamp = Date.now().toString(36);

const adjuster = { name: "Dana Whitfield", phone: "(555) 010-7734", email: "dwhitfield@granitestateauto.example" };
const clinicPays = [["2026-09-14", "2026-08-24"], ["2026-09-21", "2026-08-31"], ["2026-09-29", "2026-09-08"], ["2026-10-06", "2026-09-15"]].map(
  ([date, dos]) => ({ date, amount_cents: 25000, payee: "Northside Spine and Rehab", date_of_service: dos }),
);
const READINGS = {
  "3-payout-log.pdf": {
    document_kind: "payout_log", carrier: "Granite State Auto", claim_number: "GSA-26-118842", policy_limit_cents: 500000,
    total_paid_cents: 500000, remaining_cents: 0, exhausted: true, adjuster,
    payments: [
      { date: "2026-08-20", amount_cents: 290000, payee: "Valley Regional Emergency", date_of_service: "2026-08-03" },
      { date: "2026-08-27", amount_cents: 110000, payee: "ClearView Imaging", date_of_service: "2026-08-05" },
      ...clinicPays,
    ],
    confidence: "high",
  },
  "4-exhaustion-letter.pdf": {
    document_kind: "exhaustion_letter", carrier: "Granite State Auto", claim_number: "GSA-26-118842", policy_limit_cents: 500000,
    total_paid_cents: 500000, remaining_cents: 0, exhausted: true, exhaustion_date: "2026-10-14", adjuster, confidence: "high",
  },
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
let pendingFile = "";
await page.route("**/api/agent/read", async (route) => {
  pendingFile = /filename="([^"]+)"/.exec(route.request().postData() ?? "")?.[1] ?? pendingFile;
  await route.fulfill({ json: { task: "replay" } });
});
await page.route("**/api/agent/task**", (route) => route.fulfill({ json: { status: "done", extraction: READINGS[pendingFile] } }));
// Hide the pinned status bar and the dev badge in captures without touching nodes React owns.
const tidy = () => page.addStyleTag({ content: '[role="status"].card, nextjs-portal { display: none !important; }' });
const shot = async (name) => { await tidy(); await page.waitForTimeout(700); await page.screenshot({ path: join(out, name) }); console.log("shot", name); };
const api = (path, data) => page.request.post(base + path, { data, headers: { Origin: base } });

await page.goto(base + "/signup");
await page.fill('input[name="name"]', "Billing Lead");
await page.fill('input[name="workspaceName"]', "Northside Spine and Rehab");
await page.fill('input[name="email"]', `smoke-shots-${stamp}@autocob.test`);
await page.fill('input[name="password"]', `Shots-${stamp}-${Math.random().toString(36).slice(2, 10)}`);
await page.click('button[type="submit"]');
await page.waitForURL("**/app");
await page.evaluate(() => localStorage.setItem("autocob.guide.dismissed", "1"));
await api("/api/cases/sample");
const visits = ["2026-08-24", "2026-08-31", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"].map((date, i) => ({ id: `v${i + 1}`, date, service: "Spinal manipulation and therapy", billedCents: 25000 }));
await api("/api/cases", {
  case: {
    id: "kit-jr", patient: { name: "J.R. chart 20417", dob: "" }, clinic: "Northside Spine and Rehab", injuryDate: "2026-08-03", accident: "Auto accident",
    primary: { carrier: "Granite State Auto", coverage: "PIP", claimNumber: "GSA-26-118842", limitCents: 500000, adjuster, claimVerified: true },
    secondary: { payer: "Meridian Health PPO", memberId: "MHP-55172093", timelyFilingDays: 60 },
    visits,
    payments: visits.slice(0, 4).map((v, i) => ({ id: `p${i}`, date: clinicPays[i].date, amountCents: 25000, payee: "Northside Spine and Rehab", source: "2-carrier-eob.pdf", visitId: v.id })),
    documents: [], timeline: [{ id: "t1", date: "2026-08-10", by: "staff", text: "Case opened." }],
  },
});
await page.goto(base + "/app");
await page.click('nav[aria-label="Cases"] button:has-text("J.R. chart 20417")');
await page.waitForSelector('h1:has-text("J.R. chart 20417")');
await shot("1-worklist.png");

const read = async (file) => {
  pendingFile = file;
  await page.setInputFiles('input[type="file"]', join(docs, file));
  await page.waitForSelector('button:has-text("Approve and file")', { timeout: 30000 });
  await page.locator('section[aria-live="polite"]').last().evaluate((el) => el.scrollIntoView({ block: "center" }));
};
await read("3-payout-log.pdf");
await shot("2-agent-reading.png");
await page.click('button:has-text("Approve and file")');
await page.waitForSelector("text=Request the exhaustion letter");
await page.evaluate(() => window.scrollTo(0, 0));
await shot("3-stuck.png");
await read("4-exhaustion-letter.pdf");
await page.click('button:has-text("Approve and file")');
await page.waitForSelector("text=Send the secondary packet");
await page.click('button:has-text("Build the packet")');
await page.waitForSelector('a:has-text("Download the packet")');
await page.evaluate(() => window.scrollTo(0, 0));
await shot("4-packet-ready.png");
await page.click('button:has-text("Mark as sent")');
await page.waitForSelector("text=Nothing waiting on you");
await shot("5-done.png");
await page.click('button:has-text("Sign out")');
await page.goto(base + "/");
await shot("0-landing.png");
await browser.close();
