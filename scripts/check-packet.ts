// Builds a packet for the Greene sample case and writes it next to the samples for inspection.
// Run with: node scripts/check-packet.ts
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { computeLedger } from "../lib/ledger.ts";
import { buildPacket } from "../lib/packet.ts";
import { DEMO_TODAY, SAMPLE_CASES } from "../lib/sample-cases.ts";

const c = SAMPLE_CASES.find((x) => x.id === "greene")!;
const ledger = computeLedger(c, DEMO_TODAY);
const letter = new Uint8Array(readFileSync(new URL("../public/samples/greene-exhaustion-letter.pdf", import.meta.url)));
const { bytes, skipped } = await buildPacket({
  c,
  ledger,
  today: DEMO_TODAY,
  enclosures: [
    { name: "Exhaustion letter: Northgate exhaustion letter.pdf", bytes: letter },
    { name: "Broken file.pdf", bytes: new Uint8Array([1, 2, 3]) },
  ],
});
const pages = (await PDFDocument.load(bytes)).getPageCount();
const out = process.argv[2] ?? "/tmp/autocob-packet-check.pdf";
writeFileSync(out, bytes);
console.log(JSON.stringify({ pages, skipped, bytes: bytes.length, out }));
if (pages !== 3 || skipped.length !== 1) process.exit(1);
