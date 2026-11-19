// The bundled sample documents. Each has a stored reading so the workspace can be tried
// before the case agent is connected. With the agent connected, the same files are read live.
import type { Extraction } from "./types";

export interface SampleDoc {
  file: string;
  title: string;
  /** The sample case it belongs to; "any" is the deliberately misfiled one. */
  forCase: string;
  shows: string;
  reading: Extraction;
}

const BAYLINE = "Bayline Mutual Auto";
const NORTHGATE = "Northgate Casualty";
const CLINIC = "Eastbay Motion Physical Therapy";

const okaforClinicPayments = Array.from({ length: 7 }, (_, i) => {
  const day = (offset: number) =>
    new Date(Date.UTC(2026, 8, 14) + offset * 86_400_000).toISOString().slice(0, 10);
  return { date: day(i * 7 + 21), amount_cents: 26_000, payee: CLINIC, date_of_service: day(i * 7) };
});

export const SAMPLE_DOCS: SampleDoc[] = [
  {
    file: "alvarez-exhaustion-letter.pdf",
    title: "Exhaustion letter",
    forCase: "alvarez",
    shows: "Releases the four stuck visits to the health plan.",
    reading: {
      document_kind: "exhaustion_letter",
      carrier: BAYLINE,
      claim_number: "BMA-26-0417723",
      policy_limit_cents: 1_000_000,
      total_paid_cents: 1_000_000,
      remaining_cents: 0,
      exhausted: true,
      exhaustion_date: "2026-10-20",
      adjuster: { name: "Renee Castillo", phone: "(555) 010-4471", email: "rcastillo@baylinemutual.example" },
      confidence: "high",
    },
  },
  {
    file: "okafor-payout-log.pdf",
    title: "Carrier payout log",
    forCase: "okafor",
    shows: "Reveals a $500 payment to the urgent care that used up the benefit.",
    reading: {
      document_kind: "payout_log",
      carrier: NORTHGATE,
      claim_number: "NGC-5520931",
      policy_limit_cents: 500_000,
      total_paid_cents: 500_000,
      remaining_cents: 0,
      exhausted: true,
      adjuster: { name: "Paul Whitaker", phone: "(555) 010-2290", email: "pwhitaker@northgatecasualty.example" },
      payments: [
        { date: "2026-09-25", amount_cents: 268_000, payee: "Lakeshore Urgent Care", date_of_service: "2026-09-08" },
        ...okaforClinicPayments,
        { date: "2026-11-16", amount_cents: 50_000, payee: "Lakeshore Urgent Care", date_of_service: "2026-10-02" },
      ],
      confidence: "high",
      notes: "Listed payments add up to the stated total of $5,000.00.",
    },
  },
  {
    file: "okafor-exhaustion-letter.pdf",
    title: "Exhaustion letter",
    forCase: "okafor",
    shows: "Use after the payout log, to release the unpaid visits.",
    reading: {
      document_kind: "exhaustion_letter",
      carrier: NORTHGATE,
      claim_number: "NGC-5520931",
      policy_limit_cents: 500_000,
      total_paid_cents: 500_000,
      remaining_cents: 0,
      exhausted: true,
      exhaustion_date: "2026-11-16",
      adjuster: { name: "Paul Whitaker", phone: "(555) 010-2290", email: "pwhitaker@northgatecasualty.example" },
      confidence: "high",
    },
  },
  {
    file: "raman-claim-acknowledgement.pdf",
    title: "Claim acknowledgement",
    forCase: "raman",
    shows: "Confirms the claim and names the adjuster.",
    reading: {
      document_kind: "adjuster_letter",
      carrier: BAYLINE,
      claim_number: "BMA-26-0533108",
      policy_limit_cents: 250_000,
      total_paid_cents: 0,
      remaining_cents: 250_000,
      exhausted: false,
      adjuster: { name: "Maya Lindqvist", phone: "(555) 010-4482", email: "mlindqvist@baylinemutual.example" },
      confidence: "high",
    },
  },
  {
    file: "wrong-claim-letter.pdf",
    title: "Letter for a different patient",
    forCase: "any",
    shows: "Misfiled on purpose. AutoCOB refuses it.",
    reading: {
      document_kind: "exhaustion_letter",
      carrier: BAYLINE,
      claim_number: "BMA-26-0999999",
      policy_limit_cents: 1_000_000,
      remaining_cents: 0,
      exhausted: true,
      exhaustion_date: "2026-11-02",
      confidence: "high",
    },
  },
];

export const sampleReading = (file: string): Extraction | undefined =>
  SAMPLE_DOCS.find((s) => s.file === file)?.reading;
