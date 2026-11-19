// Connects AutoCOB to HarnessRouter: collects the API key in a hidden macOS prompt (it is
// written straight to .env.harnessrouter and never printed), then reuses or creates the
// "AutoCOB case agent" Harness and records it in harnessrouter.json.
// Run with: npm run connect
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HarnessRouter, HRError, loadApiKey } from "../lib/server/harnessrouter.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = join(root, ".env.harnessrouter");
const NAME = "AutoCOB case agent";

function haveKey(): boolean {
  try {
    return Boolean(loadApiKey(root));
  } catch {
    return false;
  }
}

if (!haveKey()) {
  console.log("A key prompt is opening. Create a key under API Keys in the HarnessRouter console and paste it there.");
  let key = "";
  try {
    key = execFileSync(
      "osascript",
      [
        "-e",
        'display dialog "Paste your HarnessRouter API key (starts with sk-hr-). It is saved only to this project." default answer "" with hidden answer with title "AutoCOB"',
        "-e",
        "text returned of result",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    console.error("Cancelled. Nothing was saved.");
    process.exit(2);
  }
  if (!key.startsWith("sk-hr-")) {
    console.error("That does not look like a HarnessRouter key (it should start with sk-hr-). Nothing was saved.");
    process.exit(2);
  }
  writeFileSync(keyFile, `HR_API_KEY=${key}\n`, { mode: 0o600 });
  chmodSync(keyFile, 0o600);
  console.log("Key saved to .env.harnessrouter (ignored by git).");
}

try {
  const hr = new HarnessRouter({ apiKey: loadApiKey(root) });
  const me = await hr.me();
  console.log(`Connected to workspace: ${me.workspace_name}`);

  const instructions = readFileSync(join(root, "harness-instructions.txt"), "utf8");
  let harness = await hr.findHarnessByName(NAME);
  if (harness) {
    console.log(`Reusing the existing Harness "${NAME}".`);
    if (harness.systemPrompt?.trim() !== instructions.trim()) {
      if (process.argv.includes("--update")) {
        // PUT replaces every field, so the body is rebuilt from the live Harness plus the new instructions.
        const live = await hr.getHarness(harness.id);
        harness = await hr.replaceHarness(
          harness.id,
          {
            name: live.harness.name,
            base: live.harness.base,
            default_model: live.harness.defaultModel,
            system_prompt: instructions,
            mcp_servers: live.harness.mcpServers,
            skills: live.harness.skills,
            plugins: live.harness.plugins,
            additional_headers: live.harness.additionalHeaders,
            env: live.harness.env,
            max_step: live.harness.maxStep,
            timeout_seconds: live.harness.timeoutSeconds,
            max_cost_usd: live.harness.maxCostUsd,
          },
          live.etag,
        );
        console.log("Updated its instructions from harness-instructions.txt.");
      } else {
        console.log("Note: its instructions differ from harness-instructions.txt. Run with --update to apply them.");
      }
    }
  } else {
    const { bases } = await hr.bases();
    const hermes = bases.find((b) => b.id === "hermes");
    const model = hermes?.models.find((m) => m.id === hermes.defaultModel && m.available) ?? hermes?.models.find((m) => m.available);
    if (!hermes || !model) throw new Error("The hermes base has no available model in this workspace.");
    harness = await hr.createHarness({
      name: NAME,
      base: "hermes",
      default_model: model.id,
      system_prompt: instructions,
      mcp_servers: [],
      skills: [],
      max_step: 60,
      timeout_seconds: 600,
      max_cost_usd: 1,
    });
    console.log(`Created the Harness "${NAME}" on hermes with ${model.id}.`);
  }
  writeFileSync(
    join(root, "harnessrouter.json"),
    JSON.stringify(
      { harness_id: harness.id, name: harness.name, base: harness.base, model: harness.defaultModel, instructions: "harness-instructions.txt" },
      null,
      2,
    ) + "\n",
  );
  console.log(`Harness ID: ${harness.id}`);
  console.log("Saved harnessrouter.json. Restart the dev server, then the workspace will show the agent as connected.");
} catch (err) {
  if (err instanceof HRError && err.status === 401) {
    console.error("HarnessRouter rejected the saved key. Delete .env.harnessrouter and run this again with a new key.");
  } else {
    console.error("Could not finish connecting:", err instanceof Error ? err.message : "unknown error");
  }
  if (!existsSync(join(root, "harnessrouter.json"))) process.exit(1);
}
