// Runs scripts/qa-ui.js in headless Chrome. Usage: node scripts/qa-run.mjs
// Needs playwright-core; point PLAYWRIGHT_CORE at its folder if it is not installed in the project.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
const src = readFileSync(new URL("./qa-ui.js", import.meta.url), "utf8").replace(/^\/\/.*\n/gm, "");
try {
  const out = await (0, eval)(`(${src})`)(page);
  console.log(out);
  process.exitCode = out.includes("FAIL") ? 1 : 0;
} finally {
  await browser.close();
}
