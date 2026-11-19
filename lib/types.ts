// Domain model for one accident-billing episode. All money is integer cents.

export type CoverageType = "PIP" | "MedPay" | "WorkersComp";

export interface Visit {
  id: string;
  date: string; // ISO yyyy-mm-dd
  service: string;
  billedCents: number;
  /** Set once the balance has gone to the health plan. */
  secondarySubmittedOn?: string;
}

/** One payment the primary carrier made. `visitId` is absent when it went to another provider. */
export interface PrimaryPayment {
  id: string;
  date: string;
  amountCents: number;
  visitId?: string;
  payee: string;
  source: string; // which document or portal check it came from
}

export type DocKind =
  | "accident_report"
  | "primary_eob"
  | "payout_log"
  | "exhaustion_letter"
  | "adjuster_letter"
  | "other";

export interface CaseDocument {
  id: string;
  kind: DocKind;
  name: string;
  addedOn: string;
  /** Path under /public for sample files; uploaded files live in the browser store. */
  sampleUrl?: string;
  note?: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  text: string;
  by: "agent" | "staff" | "system";
}

export interface AccidentCase {
  id: string;
  patient: { name: string; dob: string };
  clinic: string;
  injuryDate: string;
  accident: "Auto accident" | "Workplace injury" | "Slip and fall";
  primary: {
    carrier: string;
    coverage: CoverageType;
    claimNumber: string;
    limitCents: number;
    adjuster: { name: string; phone: string; email: string };
    claimVerified: boolean;
    exhaustionLetterOn?: string;
  };
  secondary: {
    payer: string;
    memberId: string;
    /** Days from date of service the plan allows for filing. Set per payer contract. */
    timelyFilingDays: number;
  };
  visits: Visit[];
  payments: PrimaryPayment[];
  documents: CaseDocument[];
  timeline: TimelineEvent[];
  /** Opaque continuation handle for this case's agent session. Never parsed in the browser. */
  agentThread?: string;
}

/** What the document-reading agent returns, before staff approve it. */
export interface Extraction {
  document_kind: DocKind;
  carrier?: string;
  claim_number?: string;
  policy_limit_cents?: number;
  total_paid_cents?: number;
  remaining_cents?: number;
  exhausted?: boolean;
  exhaustion_date?: string;
  adjuster?: { name?: string; phone?: string; email?: string };
  payments?: Array<{ date: string; amount_cents: number; payee: string; date_of_service?: string }>;
  confidence: "high" | "medium" | "low";
  notes?: string;
}
