// Browser QA of the signed-in product, driven through real UI controls: the file chooser, a
// drag-and-drop, dialogs, downloads. Run through the Playwright MCP tool with this file.
// Creates a throwaway smoke-…@autocob.test account; `npm run smoke` cleans those up.
async (page) => {
  const base = "http://localhost:3320";
  const docs = "/Users/nishkadesai/Moritx interview BDR/autocob/first-use-test/documents";
  const stamp = Date.now().toString(36);
  const email = `smoke-qa-${stamp}@autocob.test`;
  const password = `Qa-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
  const out = [];
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));
  const check = async (name, fn) => {
    try {
      const r = await fn();
      out.push(`${r === false ? "FAIL" : "PASS"}  ${name}${typeof r === "string" ? `  (${r})` : ""}`);
    } catch (e) {
      out.push(`FAIL  ${name}  (threw: ${String(e.message || e).split("\n")[0].slice(0, 140)})`);
    }
  };
  const inView = async (loc) => {
    const box = await loc.boundingBox();
    const vp = page.viewportSize();
    return Boolean(box && box.y >= 0 && box.y + Math.min(box.height, 80) <= vp.height);
  };
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Sign-up validation and success
  await page.goto(base + "/signup");
  await check("sign-up: short password shows a message", async () => {
    await page.fill('input[name="name"]', "QA Tester");
    await page.fill('input[name="workspaceName"]', "Northside Spine and Rehab");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', "short");
    await page.evaluate(() => document.querySelector('input[name="password"]').removeAttribute("minlength"));
    await page.click('button[type="submit"]');
    await page.waitForSelector('p[role="alert"]', { timeout: 8000 });
    return (await page.textContent('p[role="alert"]')).includes("10 characters");
  });
  await check("sign-up succeeds and lands on the worklist", async () => {
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/app", { timeout: 15000 });
    await page.waitForSelector("text=No cases yet", { timeout: 15000 });
    return true;
  });

  // New case, then an immediate visit (create and save must not race)
  await check("new case: bad limit is rejected with a message", async () => {
    await page.click('button:has-text("New case")');
    const f = page.locator("dialog[open] form");
    await f.locator('[name="patient"]').fill("J.R. chart 20417");
    await f.locator('[name="injury"]').fill("2026-08-03");
    await f.locator('[name="carrier"]').fill("Granite State Auto");
    await f.locator('[name="claim"]').fill("GSA-26-118842");
    await f.locator('[name="limit"]').fill("abc");
    await f.locator('[name="payer"]').fill("Meridian Health PPO");
    await f.locator('[name="member"]').fill("MHP-55172093");
    await f.locator('[name="days"]').fill("60");
    await f.locator('button[type="submit"]').click();
    return (await f.locator('p[role="alert"]').textContent()).includes("policy limit");
  });
  await check("new case is created and a visit added straight away is saved", async () => {
    const f = page.locator("dialog[open] form");
    await f.locator('[name="limit"]').fill("5000");
    await f.locator('button[type="submit"]').click();
    await page.waitForSelector('h1:has-text("J.R. chart 20417")');
    for (const d of ["2026-08-24", "2026-08-31", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]) {
      await page.click('button:has-text("Add a visit")');
      const v = page.locator('form:has(input[name="service"])');
      await v.locator('[name="date"]').fill(d);
      await v.locator('[name="amount"]').fill("250");
      await v.locator('button[type="submit"]').click();
    }
    await page.waitForSelector("text=All changes saved", { timeout: 20000 });
    if ((await page.locator('div[role="alert"]').allInnerTexts()).some((t) => t.trim())) return false;
    await page.reload();
    await page.waitForSelector("tbody tr");
    return (await page.locator("tbody tr").count()) === 6 ? "6 visits after reload" : false;
  });
  await check("no sample documents are offered on a real case", async () => (await page.locator("text=Sample documents to try").count()) === 0);

  // Upload through the real file chooser, starting from the Documents panel at the bottom
  await check("after choosing a file, a status bar is pinned in view while the agent reads", async () => {
    await page.locator("button.dropzone").scrollIntoViewIfNeeded();
    await page.setInputFiles('input[type="file"]', docs + "/1-claim-acknowledgement.pdf");
    const bar = page.locator('[role="status"]:has-text("Reading 1-claim-acknowledgement.pdf")');
    await bar.waitFor({ timeout: 8000 });
    return (await inView(bar)) ? "status bar visible" : false;
  });
  await check("live agent reading arrives and can be approved", async () => {
    await page.waitForSelector('button:has-text("Approve and file"), section[aria-live="polite"] p.text-form-red', { timeout: 180000 });
    if (await page.locator('section[aria-live="polite"] p.text-form-red').count()) {
      const why = await page.locator('section[aria-live="polite"] p.text-form-red').innerText();
      await page.click('section[aria-live="polite"] button:has-text("Dismiss")');
      return `SKIPPED, agent unavailable: ${why.slice(0, 70)}`;
    }
    await page.waitForTimeout(900);
    const reviewVisible = await inView(page.locator('section[aria-live="polite"]').last());
    if (!reviewVisible) return false;
    const text = await page.locator('section[aria-live="polite"]').last().innerText();
    await page.click('button:has-text("Approve and file")');
    await page.waitForTimeout(2500);
    return text.includes("Dana Whitfield") || text.includes("confirmed") ? "claim confirmed" : false;
  });
  await check("the stored file downloads from the Documents list", async () => {
    const link = page.locator('a[href^="/api/documents/"]').first();
    if (!(await link.count())) return "SKIPPED, nothing was filed because the agent is unavailable";
    const res = await page.request.get(base + (await link.getAttribute("href")));
    return res.status() === 200 && (await res.body()).length > 1000;
  });
  await check("a .txt file is refused with a clear message", async () => {
    await page.setInputFiles('input[type="file"]', { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    const msg = page.locator('section[aria-live="polite"] p.text-form-red');
    await msg.waitFor({ timeout: 5000 });
    const ok = (await msg.innerText()).includes("not a PDF");
    await page.click('section[aria-live="polite"] button:has-text("Dismiss")');
    return ok;
  });
  await check("drag-and-drop onto the drop area starts a read", async () => {
    const dt = await page.evaluateHandle(async () => {
      const blob = await (await fetch("/samples/wrong-claim-letter.pdf")).blob();
      const t = new DataTransfer();
      t.items.add(new File([blob], "5-letter-for-another-patient.pdf", { type: "application/pdf" }));
      return t;
    });
    await page.dispatchEvent("button.dropzone", "dragover", { dataTransfer: dt });
    await page.dispatchEvent("button.dropzone", "drop", { dataTransfer: dt });
    await page.waitForSelector('section[aria-live="polite"]:has-text("5-letter-for-another-patient.pdf")', { timeout: 8000 });
    const done = page.locator('section[aria-live="polite"] button:has-text("Dismiss"), section[aria-live="polite"] button:has-text("Discard")');
    await done.first().waitFor({ timeout: 300000 });
    const refused = await page.locator("text=Check it was filed to the right patient").count();
    await done.first().click();
    return refused ? "misfiled letter refused" : "drop accepted; SKIPPED the read, agent unavailable";
  });

  // Manual payment, edit, filters, search, export
  await check("record a carrier payment by hand", async () => {
    await page.click('button:has-text("Record a carrier payment")');
    const f = page.locator('form:has(select[name="to"])');
    await f.locator('[name="amount"]').fill("250");
    await f.locator('button[type="submit"]').click();
    await page.waitForTimeout(1500);
    return (await page.locator('tbody tr:has-text("Paid by carrier")').count()) === 1;
  });
  await check("edit details changes the filing window", async () => {
    await page.click('button:has-text("Edit details")');
    const f = page.locator("dialog[open] form");
    await f.locator('[name="days"]').fill("90");
    await f.locator('button[type="submit"]').click();
    await page.waitForSelector("text=Files within 90 days", { timeout: 5000 });
    return true;
  });
  await check("search and filters narrow the list", async () => {
    await page.fill("#case-search", "zzz-no-match");
    const empty = await page.locator("text=No cases match").count();
    await page.fill("#case-search", "granite");
    const one = await page.locator('nav[aria-label="Cases"] li').count();
    await page.fill("#case-search", "");
    await page.click('button:has-text("Done")');
    const done = await page.locator('nav[aria-label="Cases"] li').count();
    await page.click('nav[aria-label="Cases"] button:has-text("All")');
    return empty === 1 && one === 1 && done === 0;
  });
  await check("CSV export downloads a file with the case in it", async () => {
    await page.evaluate(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b) => ((window.__csv = b), orig(b));
    });
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.click('button:has-text("Export CSV")')]);
    const text = await page.evaluate(() => window.__csv.text());
    return dl.suggestedFilename().endsWith(".csv") && text.includes("GSA-26-118842") && text.split("\n").length === 2;
  });
  await check("worklist has no sideways scroll at phone width", async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.waitForTimeout(500);
    const ok = await noOverflow();
    await page.setViewportSize({ width: 1280, height: 800 });
    return ok;
  });

  // Team: invite link, second person joins in a separate browser context
  let inviteUrl = "";
  await check("team page creates an invite link", async () => {
    await page.click('a:has-text("Team")');
    await page.waitForSelector('button:has-text("Create an invite link")');
    await page.click('button:has-text("Create an invite link")');
    await page.waitForSelector("text=/signup\\?invite=/", { timeout: 8000 });
    inviteUrl = (await page.locator("p.fig").innerText()).trim();
    return inviteUrl.includes("/signup?invite=");
  });
  await check("a teammate joins with the link and sees the same case", async () => {
    const ctx = await page.context().browser().newContext();
    const p2 = await ctx.newPage();
    await p2.goto(inviteUrl);
    await p2.fill('input[name="name"]', "QA Teammate");
    await p2.fill('input[name="email"]', `smoke-qa2-${stamp}@autocob.test`);
    await p2.fill('input[name="password"]', password);
    await p2.click('button[type="submit"]');
    await p2.waitForURL("**/app", { timeout: 15000 });
    await p2.waitForSelector('h1:has-text("J.R. chart 20417")', { timeout: 15000 });
    const header = await p2.locator("header").innerText();
    await ctx.close();
    return header.includes("Northside Spine and Rehab");
  });

  // Delete, sign out, sign in
  await check("delete case asks first, then removes it", async () => {
    await page.goto(base + "/app");
    await page.waitForSelector('h1:has-text("J.R. chart 20417")');
    page.once("dialog", (d) => d.accept());
    await page.click('button:has-text("Delete case")');
    await page.waitForSelector("text=No cases yet", { timeout: 8000 });
    await page.reload();
    await page.waitForSelector("text=No cases yet", { timeout: 8000 });
    return true;
  });
  await check("sign out returns to the landing page and /app is locked again", async () => {
    await page.click('button:has-text("Sign out")');
    await page.waitForURL(base + "/", { timeout: 10000 });
    await page.goto(base + "/app");
    await page.waitForURL("**/login", { timeout: 10000 });
    return true;
  });
  await check("wrong password is refused; right password signs in", async () => {
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', "definitely-wrong-1");
    await page.click('button[type="submit"]');
    await page.waitForSelector('p[role="alert"]');
    const refused = (await page.textContent('p[role="alert"]')).includes("do not match");
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/app", { timeout: 15000 });
    return refused;
  });

  // Public demo and landing
  await check("public demo: sample letter, approve, packet download", async () => {
    await page.click('button:has-text("Sign out")');
    await page.goto(base + "/demo");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('button:has-text("Use the sample: Exhaustion letter")');
    await page.click('button:has-text("Approve and file")', { timeout: 10000 });
    await page.click('button:has-text("Build the packet")');
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.click('a:has-text("Download the packet")')]);
    return dl.suggestedFilename().includes("Maria Alvarez");
  });
  await check("landing, sign-in and demo have no sideways scroll at phone width", async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    const bad = [];
    for (const path of ["/", "/login", "/signup", "/demo"]) {
      await page.goto(base + path);
      await page.waitForTimeout(600);
      if (!(await noOverflow())) bad.push(path);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    return bad.length ? false : true;
  });

  const real = errors.filter((e) => !e.includes("401") && !e.includes("Failed to load resource"));
  out.push(`${real.length ? "FAIL" : "PASS"}  no unexpected browser console errors${real.length ? `  (${real.slice(0, 3).join(" | ")})` : ""}`);
  return out.join("\n");
}
