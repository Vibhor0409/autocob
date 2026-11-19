// Synthetic cases for the demo workspace. Every person, carrier, claim number and dollar
// figure here is invented. No real patient data is used anywhere in this project.
import type { AccidentCase, PrimaryPayment, Visit } from "./types";
import { addDays } from "./ledger.ts";

export const DEMO_TODAY = "2026-11-19";

function visits(prefix: string, start: string, everyDays: number, count: number, cents: number, service: string): Visit[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-v${i + 1}`,
    date: addDays(start, i * everyDays),
    service,
    billedCents: cents,
  }));
}

function payFirst(vs: Visit[], n: number, payee: string, source: string, lagDays = 21): PrimaryPayment[] {
  return vs.slice(0, n).map((v) => ({
    id: `${v.id}-pay`,
    date: addDays(v.date, lagDays),
    amountCents: v.billedCents,
    visitId: v.id,
    payee,
    source,
  }));
}

const CLINIC = "Eastbay Motion Physical Therapy";

// 1. Benefits used up, no letter yet: the stuck case the product exists for.
const alvarezVisits = visits("alv", "2026-07-06", 6, 18, 31_500, "PT evaluation and therapeutic exercise");
const alvarez: AccidentCase = {
  id: "alvarez",
  patient: { name: "Maria Alvarez", dob: "1988-03-14" },
  clinic: CLINIC,
  injuryDate: "2026-06-27",
  accident: "Auto accident",
  primary: {
    carrier: "Bayline Mutual Auto",
    coverage: "PIP",
    claimNumber: "BMA-26-0417723",
    limitCents: 1_000_000,
    adjuster: { name: "Renee Castillo", phone: "(555) 010-4471", email: "rcastillo@baylinemutual.example" },
    claimVerified: true,
  },
  secondary: { payer: "Sierra Crest Health Plan", memberId: "SCH-88402117", timelyFilingDays: 180 },
  visits: alvarezVisits,
  payments: [
    { id: "alv-er", date: "2026-07-20", amountCents: 417_000, payee: "Alta Vista Emergency Dept", source: "Carrier payout log" },
    { id: "alv-img", date: "2026-07-28", amountCents: 142_000, payee: "Harbor Diagnostic Imaging", source: "Carrier payout log" },
    ...payFirst(alvarezVisits, 14, CLINIC, "Bayline EOB"),
  ],
  documents: [
    { id: "alv-d1", kind: "accident_report", name: "Accident report 26-118204.pdf", addedOn: "2026-07-06", sampleUrl: "/samples/alvarez-accident-report.pdf" },
    { id: "alv-d2", kind: "payout_log", name: "Bayline PIP payout log.pdf", addedOn: "2026-10-30", sampleUrl: "/samples/alvarez-payout-log.pdf" },
  ],
  timeline: [
    { id: "alv-t1", date: "2026-07-06", text: "Intake complete. Claim BMA-26-0417723 confirmed with adjuster, PIP limit $10,000.", by: "staff" },
    { id: "alv-t2", date: "2026-10-30", text: "Payout log read: $5,590 paid to other providers, $4,410 to this clinic. Limit reached.", by: "agent" },
    { id: "alv-t3", date: "2026-11-03", text: "Sierra Crest denied visit 15 (CARC 22): primary payer proof required.", by: "system" },
  ],
};

// 2. One paid visit of benefit left.
const okaforVisits = visits("oka", "2026-09-14", 7, 9, 26_000, "Chiropractic manipulation and manual therapy");
const okafor: AccidentCase = {
  id: "okafor",
  patient: { name: "Daniel Okafor", dob: "1975-11-02" },
  clinic: CLINIC,
  injuryDate: "2026-09-08",
  accident: "Auto accident",
  primary: {
    carrier: "Northgate Casualty",
    coverage: "MedPay",
    claimNumber: "NGC-5520931",
    limitCents: 500_000,
    adjuster: { name: "Paul Whitaker", phone: "(555) 010-2290", email: "pwhitaker@northgatecasualty.example" },
    claimVerified: true,
  },
  secondary: { payer: "Union Coast PPO", memberId: "UCP-30991824", timelyFilingDays: 120 },
  visits: okaforVisits,
  payments: [
    { id: "oka-uc", date: "2026-09-25", amountCents: 268_000, payee: "Lakeshore Urgent Care", source: "Carrier payout log" },
    ...payFirst(okaforVisits, 7, CLINIC, "Northgate EOB"),
  ],
  documents: [],
  timeline: [
    { id: "oka-t1", date: "2026-09-14", text: "Intake complete. MedPay limit $5,000 confirmed.", by: "staff" },
  ],
};

// 3. New intake, claim not yet confirmed.
const ramanVisits = visits("ram", "2026-11-10", 5, 2, 29_500, "PT evaluation");
const raman: AccidentCase = {
  id: "raman",
  patient: { name: "Priya Raman", dob: "1994-08-21" },
  clinic: CLINIC,
  injuryDate: "2026-11-04",
  accident: "Auto accident",
  primary: {
    carrier: "Bayline Mutual Auto",
    coverage: "PIP",
    claimNumber: "BMA-26-0533108",
    limitCents: 250_000,
    adjuster: { name: "Unassigned", phone: "(555) 010-4400", email: "claims@baylinemutual.example" },
    claimVerified: false,
  },
  secondary: { payer: "Sierra Crest Health Plan", memberId: "SCH-77120456", timelyFilingDays: 180 },
  visits: ramanVisits,
  payments: [],
  documents: [],
  timeline: [{ id: "ram-t1", date: "2026-11-10", text: "Case opened from intake form.", by: "staff" }],
};

// 4. Letter on file, packet ready, filing clock running.
const greeneVisits = visits("gre", "2026-07-20", 7, 12, 30_000, "Orthopedic follow-up and therapy");
const greene: AccidentCase = {
  id: "greene",
  patient: { name: "Thomas Greene", dob: "1962-01-30" },
  clinic: CLINIC,
  injuryDate: "2026-07-11",
  accident: "Slip and fall",
  primary: {
    carrier: "Northgate Casualty",
    coverage: "MedPay",
    claimNumber: "NGC-5498822",
    limitCents: 250_000,
    adjuster: { name: "Paul Whitaker", phone: "(555) 010-2290", email: "pwhitaker@northgatecasualty.example" },
    claimVerified: true,
    exhaustionLetterOn: "2026-10-12",
  },
  secondary: { payer: "Union Coast PPO", memberId: "UCP-44718203", timelyFilingDays: 120 },
  visits: greeneVisits,
  payments: [
    { id: "gre-er", date: "2026-07-30", amountCents: 100_000, payee: "Alta Vista Emergency Dept", source: "Carrier payout log" },
    ...payFirst(greeneVisits, 5, CLINIC, "Northgate EOB"),
  ],
  documents: [
    { id: "gre-d1", kind: "exhaustion_letter", name: "Northgate exhaustion letter.pdf", addedOn: "2026-10-12", sampleUrl: "/samples/greene-exhaustion-letter.pdf" },
  ],
  timeline: [
    { id: "gre-t1", date: "2026-10-12", text: "Exhaustion letter received and filed. 7 visits ready for Union Coast PPO.", by: "agent" },
  ],
};

export const SAMPLE_CASES: AccidentCase[] = [alvarez, greene, okafor, raman];
