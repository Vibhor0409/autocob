// Generates the first-use test kit: five fictional carrier documents for one case that the
// tester enters by hand. Run with: node scripts/make-first-use-kit.mjs
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "first-use-test", "documents");
mkdirSync(out, { recursive: true });

const CLINIC = "Northside Spine and Rehab";
const CARRIER = "Granite State Auto";
const SUB = "Personal Injury Protection  |  Claims Department  |  PO Box 7100, Concord NH";
const CLAIM = "GSA-26-118842";
const ADJUSTER = "Dana Whitfield, Claims Adjuster";
const CONTACT = "(555) 010-7734  |  dwhitfield@granitestateauto.example";

async function make(name, { date, blocks }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([612, 792]);
  let y = 728;
  const put = (t, o = {}) => {
    const size = o.size ?? 10.5;
    page.drawText(t, { x: 64, y: y - size, size, font: o.mono ? mono : o.bold ? bold : font, color: o.color ?? rgb(0.1, 0.1, 0.12) });
    y -= size + (o.gap ?? 6);
  };
  put(CARRIER, { size: 17, bold: true, gap: 3 });
  put(SUB, { size: 9, color: rgb(0.4, 0.4, 0.45), gap: 22 });
  put(date, { gap: 16 });
  for (const b of blocks) {
    if (b.h) put(b.h, { bold: true, size: 11.5, gap: 8 });
    for (const l of b.lines ?? []) put(l, { mono: b.mono, size: b.mono ? 9.5 : 10.5 });
    y -= 10;
  }
  page.drawText("TEST DOCUMENT. Every name, number and amount is fictional.", { x: 64, y: 40, size: 8, font, color: rgb(0.55, 0.2, 0.2) });
  writeFileSync(join(out, name), await doc.save());
  console.log("wrote", name);
}

const pad = (s, n) => String(s).padEnd(n);
const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });
const header = [`Insured: J.R. (chart 20417)`, `Claim number: ${CLAIM}`, "Date of loss: 08/03/2026"];
const clinicRows = [
  ["2026-09-14", "2026-08-24"],
  ["2026-09-21", "2026-08-31"],
  ["2026-09-29", "2026-09-08"],
  ["2026-10-06", "2026-09-15"],
].map(([paid, dos]) => `${pad(paid, 12)}${pad(dos, 12)}${pad(CLINIC, 30)}${usd(250)}`);
const tableHead = `${pad("Paid", 12)}${pad("Service", 12)}${pad("Payee", 30)}Amount`;

await make("1-claim-acknowledgement.pdf", {
  date: "August 12, 2026",
  blocks: [
    { lines: [CLINIC, "Billing office"] },
    { h: "Re: Claim acknowledgement", lines: header },
    { lines: [
      "We have accepted the above claim for Personal Injury Protection (PIP)",
      "benefits. The policy limit is $5,000.00. No payments have been issued",
      "to date. Remaining benefit: $5,000.00.",
      "",
      "Please send bills and records to the assigned adjuster below.",
    ] },
    { lines: [ADJUSTER, CONTACT] },
  ],
});

await make("2-carrier-eob.pdf", {
  date: "October 6, 2026",
  blocks: [
    { h: "Explanation of benefits", lines: [...header, `Provider: ${CLINIC}`] },
    { mono: true, lines: [tableHead, ...clinicRows] },
    { lines: ["Total paid to this provider on this statement: $1,000.00"] },
    { lines: [ADJUSTER, CONTACT] },
  ],
});

await make("3-payout-log.pdf", {
  date: "October 15, 2026",
  blocks: [
    { h: "PIP payout log", lines: [...header, "Policy limit: $5,000.00", `Adjuster: ${ADJUSTER.split(",")[0]}, (555) 010-7734, dwhitfield@granitestateauto.example`] },
    { mono: true, lines: [
      tableHead,
      `${pad("2026-08-20", 12)}${pad("2026-08-03", 12)}${pad("Valley Regional Emergency", 30)}${usd(2900)}`,
      `${pad("2026-08-27", 12)}${pad("2026-08-05", 12)}${pad("ClearView Imaging", 30)}${usd(1100)}`,
      ...clinicRows,
    ] },
    { lines: ["Total paid: $5,000.00", "Remaining benefit: $0.00"] },
  ],
});

const letter = (name, o) => make(name, {
  date: o.date,
  blocks: [
    { lines: [CLINIC, "Billing office"] },
    { h: "Re: Exhaustion of Personal Injury Protection (PIP) benefits", lines: [`Insured: ${o.insured}`, `Claim number: ${o.claim}`, `Date of loss: ${o.loss}`] },
    { lines: [
      "This letter confirms that the Personal Injury Protection (PIP) benefit",
      `available under the above claim, in the amount of ${o.limit}, has been`,
      `paid in full. Benefits were exhausted on ${o.exhausted}.`,
      `Total paid: ${o.limit}. Remaining benefit: $0.00.`,
      "",
      "No further payment will be issued under this coverage. Please submit",
      "any outstanding charges to the patient's health insurance carrier.",
    ] },
    { lines: ["Sincerely,", ADJUSTER, CONTACT] },
  ],
});

await letter("4-exhaustion-letter.pdf", {
  date: "November 17, 2026", insured: "J.R. (chart 20417)", claim: CLAIM, loss: "08/03/2026", limit: "$5,000.00", exhausted: "October 14, 2026",
});
await letter("5-letter-for-another-patient.pdf", {
  date: "November 10, 2026", insured: "T.M. (chart 31190)", claim: "GSA-26-200001", loss: "07/19/2026", limit: "$5,000.00", exhausted: "November 2, 2026",
});
