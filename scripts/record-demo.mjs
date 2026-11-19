// Records the public demo flow as timestamped frames (sharp, 1920x1080) with a visible cursor.
// Each beat starts at a fixed time so the narration lines can be laid over it.
// Usage: PLAYWRIGHT_CORE=<path> node scripts/record-demo.mjs <out dir> [base url]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const out = process.argv[2];
const base = (process.argv[3] ?? "https://autocob.vercel.app").replace(/\/$/, "");
mkdirSync(join(out, "frames"), { recursive: true });

// Beat start times in seconds, matching the narration lines d1..d5.
const BEATS = { letter: 7.5, approve: 13.6, packet: 17.3, sent: 23.1, end: 30.4 };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 765 }, deviceScaleFactor: 1920 / 1360 });
await ctx.addInitScript(() => {
  try { localStorage.setItem("autocob.guide.dismissed", "1"); } catch {}
  const boot = () => {
    if (document.getElementById("demo-cursor")) return;
    const c = document.createElement("div");
    c.id = "demo-cursor";
    c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:30px;transform:translate(700px,380px)";
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l15 9.2-6.6 1.3 4 7.6-2.9 1.5-4-7.7L4 18.6z" fill="#10222c" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const ring = document.createElement("div");
    ring.style.cssText = "position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(12,138,123,.28);border:2px solid rgba(12,138,123,.7);opacity:0;transform:translate(0,0) scale(.3)";
    document.documentElement.append(ring, c);
    addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    addEventListener("mousedown", (e) => {
      ring.style.transition = "none"; ring.style.opacity = "1"; ring.style.transform = `translate(${e.clientX}px,${e.clientY}px) scale(.3)`;
      requestAnimationFrame(() => { ring.style.transition = "transform .45s ease-out, opacity .45s ease-out"; ring.style.opacity = "0"; ring.style.transform = `translate(${e.clientX}px,${e.clientY}px) scale(1.25)`; });
    }, true);
  };
  if (document.documentElement) boot();
  document.addEventListener("DOMContentLoaded", boot);
});
const page = await ctx.newPage();
await page.goto(base + "/demo", { waitUntil: "networkidle" });
const got = page.locator('button:has-text("Got it")');
if (await got.count()) await got.first().click();
await page.waitForSelector('h1:has-text("Maria Alvarez")');
await page.addStyleTag({ content: "nextjs-portal{display:none!important} html{scroll-behavior:smooth}" });
await page.mouse.move(840, 260);
await page.waitForTimeout(800);

const cdp = await ctx.newCDPSession(page);
const frames = [];
let n = 0;
cdp.on("Page.screencastFrame", (f) => {
  const name = `f${String(++n).padStart(5, "0")}.jpg`;
  writeFileSync(join(out, "frames", name), Buffer.from(f.data, "base64"));
  frames.push({ name, t: f.metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const until = async (t) => { const ms = t * 1000 - (Date.now() - t0); if (ms > 0) await page.waitForTimeout(ms); };
const log = [];
const mark = (label) => { log.push({ label, t: +now().toFixed(2) }); console.log(label, now().toFixed(2)); };

let pos = { x: 840, y: 260 };
const glide = async (x, y, ms = 800) => {
  const steps = Math.max(12, Math.round(ms / 16));
  const from = { ...pos };
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const arc = Math.sin(k * Math.PI) * 14;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e - arc);
    await page.waitForTimeout(16);
  }
  pos = { x, y };
};
const centre = async (sel) => {
  const el = page.locator(sel).first();
  await el.evaluate((n) => n.scrollIntoView({ block: "center", behavior: "smooth" }));
  await page.waitForTimeout(650);
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const press = async (sel) => { const p = await centre(sel); await glide(p.x, p.y); await page.waitForTimeout(220); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); };
const point = async (sel, ms = 900) => { const el = page.locator(sel).first(); const b = await el.boundingBox(); if (b) await glide(b.x + b.width / 2, b.y + b.height / 2 + 18, ms); };

// d1: the worklist and the stuck amount
mark("start");
await page.waitForTimeout(1500);
await point("text=Stuck: needs exhaustion letter", 1000);
await page.waitForTimeout(2200);
await point('nav[aria-label="Cases"] >> text=Request the exhaustion letter', 1100);

// d2: add the carrier's letter, review the reading
await until(BEATS.letter);
mark("letter");
await press('button:has-text("Use the sample: Exhaustion letter")');
await page.waitForSelector('button:has-text("Approve and file")', { timeout: 30000 });
mark("reading shown");
await page.locator('section[aria-live="polite"]').last().evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
await page.waitForTimeout(900);
await glide(pos.x + 120, pos.y - 110, 900);

// d3: approve
await until(BEATS.approve);
mark("approve");
await press('button:has-text("Approve and file")');
await page.waitForSelector("text=Send the secondary packet");
mark("approved");
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await page.waitForTimeout(900);
await point("text=Ready for", 900).catch(() => {});

// d4: build the packet
await until(BEATS.packet);
mark("packet");
await press('button:has-text("Build the packet")');
await page.waitForSelector('a:has-text("Download the packet")', { timeout: 30000 });
mark("packet built");
await page.waitForTimeout(700);
await point('a:has-text("Download the packet")', 900);

// d5: mark as sent
await until(BEATS.sent);
mark("sent");
await press('button:has-text("Mark as sent")');
await page.waitForSelector("text=Nothing waiting on you");
mark("done");
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await page.waitForTimeout(1000);
await glide(1000, 440, 1200);
await until(BEATS.end);
mark("end");
await cdp.send("Page.stopScreencast");
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, "last.png") });

// ffmpeg concat list with each frame held until the next one arrives
const first = frames[0].t;
const total = BEATS.end;
let list = "";
frames.forEach((f, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].t - first : total;
  const d = Math.max(0.001, next - (f.t - first));
  list += `file 'frames/${f.name}'\nduration ${d.toFixed(4)}\n`;
});
list += `file 'frames/${frames[frames.length - 1].name}'\n`;
writeFileSync(join(out, "frames.txt"), list);
writeFileSync(join(out, "log.json"), JSON.stringify({ frames: frames.length, log }, null, 2));
console.log("frames", frames.length);
await browser.close();
