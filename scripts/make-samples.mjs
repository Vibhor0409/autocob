// Generates the fictional sample documents under public/samples.
// Run with: node scripts/make-samples.mjs
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "samples");
mkdirSync(out, { recursive: true });

async function make(name, { letterhead, sub, date, blocks }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([612, 792]);
  let y = 728;
  const put = (t, o = {}) => {
    const size = o.size ?? 10.5;
    page.drawText(t, { x: o.x ?? 64, y: y - size, size, font: o.mono ? mono : o.bold ? bold : font, color: o.color ?? rgb(0.1, 0.1, 0.12) });
    y -= size + (o.gap ?? 6);
  };
  put(letterhead, { size: 17, bold: true, gap: 3 });
  put(sub, { size: 9, color: rgb(0.4, 0.4, 0.45), gap: 22 });
  put(date, { gap: 16 });
  for (const b of blocks) {
    if (b.h) put(b.h, { bold: true, size: 11.5, gap: 8 });
    for (const l of b.lines ?? []) put(l, { mono: b.mono, size: b.mono ? 9.5 : 10.5 });
    y -= 10;
  }
  page.drawText("SAMPLE DOCUMENT. Every name, number and amount is fictional.", {
    x: 64, y: 40, size: 8, font, color: rgb(0.55, 0.2, 0.2),
  });
  writeFileSync(join(out, name), await doc.save());
  console.log("wrote", name);
}

const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2 });
const pad = (s, n) => String(s).padEnd(n);

// Alvarez: 14 clinic payments of $315 from 2026-07-27, every 6 days.
const start = new Date("2026-07-06T00:00:00Z");
const rows = Array.from({ length: 14 }, (_, i) => {
  const dos = new Date(start.getTime() + i * 6 * 864e5).toISOString().slice(0, 10);
  const paid = new Date(start.getTime() + (i * 6 + 21) * 864e5).toISOString().slice(0, 10);
  return `${pad(paid, 12)}${pad(dos, 12)}${pad("Eastbay Motion Physical Therapy", 34)}${usd(315)}`;
});

await make("alvarez-payout-log.pdf", {
  letterhead: "Bayline Mutual Auto",
  sub: "Personal Injury Protection  |  Claims Operations  |  PO Box 4400, Oakland CA",
  date: "October 30, 2026",
  blocks: [
    { h: "PIP payout log", lines: ["Insured: Maria Alvarez", "Claim number: BMA-26-0417723", "Date of loss: 06/27/2026", "Policy limit: $10,000.00", "Adjuster: Renee Castillo, (555) 010-4471, rcastillo@baylinemutual.example"] },
    { mono: true, lines: [
      `${pad("Paid", 12)}${pad("Service", 12)}${pad("Payee", 34)}Amount`,
      `${pad("2026-07-20", 12)}${pad("2026-06-27", 12)}${pad("Alta Vista Emergency Dept", 34)}${usd(4170)}`,
      `${pad("2026-07-28", 12)}${pad("2026-06-29", 12)}${pad("Harbor Diagnostic Imaging", 34)}${usd(1420)}`,
      ...rows,
    ] },
    { lines: ["Total paid: $10,000.00", "Remaining benefit: $0.00"] },
  ],
});

await make("alvarez-accident-report.pdf", {
  letterhead: "Traffic Collision Report",
  sub: "Report 26-118204  |  Records Division",
  date: "Reported June 27, 2026",
  blocks: [
    { h: "Parties", lines: ["Driver 1: Maria Alvarez, DOB 03/14/1988", "Insurer: Bayline Mutual Auto, policy BMA-PA-7730192", "Driver 2: redacted"] },
    { h: "Summary", lines: ["Rear-end collision at a signal-controlled intersection.", "Driver 1 reported neck and lower back pain at the scene", "and was transported to Alta Vista Emergency Department."] },
    { h: "Insurance claim", lines: ["Claim opened with Bayline Mutual Auto: BMA-26-0417723"] },
  ],
});

const letter = (file, o) => make(file, {
  letterhead: o.carrier,
  sub: o.sub,
  date: o.date,
  blocks: [
    { lines: [o.clinic, "Billing office"] },
    { h: `Re: Exhaustion of ${o.coverage} benefits`, lines: [`Insured: ${o.patient}`, `Claim number: ${o.claim}`, `Date of loss: ${o.loss}`] },
    { lines: [
      `This letter confirms that the ${o.coverage} benefit available under the`,
      `above claim, in the amount of ${o.limit}, has been paid in full.`,
      `Benefits were exhausted on ${o.exhausted}. Total paid: ${o.limit}.`,
      "Remaining benefit: $0.00.",
      "",
      "No further payment will be issued under this coverage. Please submit",
      "any outstanding charges to the patient's health insurance carrier.",
    ] },
    { lines: ["Sincerely,", o.adjuster, o.contact] },
  ],
});

await letter("alvarez-exhaustion-letter.pdf", {
  carrier: "Bayline Mutual Auto",
  sub: "Personal Injury Protection  |  Claims Operations  |  PO Box 4400, Oakland CA",
  date: "November 17, 2026",
  clinic: "Eastbay Motion Physical Therapy",
  coverage: "Personal Injury Protection (PIP)",
  patient: "Maria Alvarez",
  claim: "BMA-26-0417723",
  loss: "06/27/2026",
  limit: "$10,000.00",
  exhausted: "October 20, 2026",
  adjuster: "Renee Castillo, Claims Adjuster",
  contact: "(555) 010-4471  |  rcastillo@baylinemutual.example",
});

await letter("greene-exhaustion-letter.pdf", {
  carrier: "Northgate Casualty",
  sub: "Medical Payments Coverage  |  Claims  |  PO Box 2290, Sacramento CA",
  date: "October 12, 2026",
  clinic: "Eastbay Motion Physical Therapy",
  coverage: "Medical Payments (MedPay)",
  patient: "Thomas Greene",
  claim: "NGC-5498822",
  loss: "07/11/2026",
  limit: "$2,500.00",
  exhausted: "September 15, 2026",
  adjuster: "Paul Whitaker, Claims Adjuster",
  contact: "(555) 010-2290  |  pwhitaker@northgatecasualty.example",
});

// Okafor: the urgent care billed a follow-up, which uses the last of the MedPay benefit.
const okaStart = new Date("2026-09-14T00:00:00Z");
const okaRows = Array.from({ length: 7 }, (_, i) => {
  const dos = new Date(okaStart.getTime() + i * 7 * 864e5).toISOString().slice(0, 10);
  const paid = new Date(okaStart.getTime() + (i * 7 + 21) * 864e5).toISOString().slice(0, 10);
  return `${pad(paid, 12)}${pad(dos, 12)}${pad("Eastbay Motion Physical Therapy", 34)}${usd(260)}`;
});
await make("okafor-payout-log.pdf", {
  letterhead: "Northgate Casualty",
  sub: "Medical Payments Coverage  |  Claims  |  PO Box 2290, Sacramento CA",
  date: "November 18, 2026",
  blocks: [
    { h: "MedPay payment history", lines: ["Insured: Daniel Okafor", "Claim number: NGC-5520931", "Date of loss: 09/08/2026", "Coverage limit: $5,000.00", "Adjuster: Paul Whitaker, (555) 010-2290, pwhitaker@northgatecasualty.example"] },
    { mono: true, lines: [
      `${pad("Paid", 12)}${pad("Service", 12)}${pad("Payee", 34)}Amount`,
      `${pad("2026-09-25", 12)}${pad("2026-09-08", 12)}${pad("Lakeshore Urgent Care", 34)}${usd(2680)}`,
      ...okaRows,
      `${pad("2026-11-16", 12)}${pad("2026-10-02", 12)}${pad("Lakeshore Urgent Care", 34)}${usd(500)}`,
    ] },
    { lines: ["Total paid: $5,000.00", "Remaining benefit: $0.00"] },
  ],
});

await letter("okafor-exhaustion-letter.pdf", {
  carrier: "Northgate Casualty",
  sub: "Medical Payments Coverage  |  Claims  |  PO Box 2290, Sacramento CA",
  date: "November 19, 2026",
  clinic: "Eastbay Motion Physical Therapy",
  coverage: "Medical Payments (MedPay)",
  patient: "Daniel Okafor",
  claim: "NGC-5520931",
  loss: "09/08/2026",
  limit: "$5,000.00",
  exhausted: "November 16, 2026",
  adjuster: "Paul Whitaker, Claims Adjuster",
  contact: "(555) 010-2290  |  pwhitaker@northgatecasualty.example",
});

await make("raman-claim-acknowledgement.pdf", {
  letterhead: "Bayline Mutual Auto",
  sub: "Personal Injury Protection  |  Claims Operations  |  PO Box 4400, Oakland CA",
  date: "November 17, 2026",
  blocks: [
    { lines: ["Eastbay Motion Physical Therapy", "Billing office"] },
    { h: "Re: Claim acknowledgement", lines: ["Insured: Priya Raman", "Claim number: BMA-26-0533108", "Date of loss: 11/04/2026"] },
    { lines: [
      "We have accepted the above claim for Personal Injury Protection",
      "benefits. The policy limit is $2,500.00. No payments have been",
      "issued to date. Remaining benefit: $2,500.00.",
      "",
      "Please send bills and records to the assigned adjuster below.",
    ] },
    { lines: ["Maya Lindqvist, Claims Adjuster", "(555) 010-4482  |  mlindqvist@baylinemutual.example"] },
  ],
});

// Filed to the wrong patient on purpose: AutoCOB should refuse it on any of the sample cases.
await letter("wrong-claim-letter.pdf", {
  carrier: "Bayline Mutual Auto",
  sub: "Personal Injury Protection  |  Claims Operations  |  PO Box 4400, Oakland CA",
  date: "November 12, 2026",
  clinic: "Eastbay Motion Physical Therapy",
  coverage: "Personal Injury Protection (PIP)",
  patient: "Jordan Pell",
  claim: "BMA-26-0999999",
  loss: "08/02/2026",
  limit: "$10,000.00",
  exhausted: "November 2, 2026",
  adjuster: "Renee Castillo, Claims Adjuster",
  contact: "(555) 010-4471  |  rcastillo@baylinemutual.example",
});
