// Turns an agent's reading of a document into proposed changes to a case. Nothing is applied
// until staff approve it: `changes` is what they review, `next` is the case after approval.
import type { AccidentCase, DocKind, Extraction, PrimaryPayment } from "./types";
import { formatUsd } from "./ledger.ts";

export interface Proposal {
  /** Set when the document must not be applied, with the reason to show. */
  blocked?: string;
  changes: string[];
  next: AccidentCase;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const sameParty = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x));
};

export const KIND_LABEL: Record<DocKind, string> = {
  accident_report: "Accident report",
  primary_eob: "Carrier EOB",
  payout_log: "Payout log",
  exhaustion_letter: "Exhaustion letter",
  adjuster_letter: "Adjuster letter",
  other: "Other document",
};

export function proposeChanges(c: AccidentCase, ex: Extraction, docName: string, today: string): Proposal {
  const next: AccidentCase = structuredClone(c);
  const changes: string[] = [];

  if (ex.claim_number && norm(ex.claim_number) !== norm(c.primary.claimNumber)) {
    return {
      blocked: `This document is for claim ${ex.claim_number}, but this case is claim ${c.primary.claimNumber}. Check it was filed to the right patient.`,
      changes,
      next: c,
    };
  }
  if (ex.carrier && !sameParty(ex.carrier, c.primary.carrier)) {
    return {
      blocked: `This document is from ${ex.carrier}, but the primary carrier on this case is ${c.primary.carrier}.`,
      changes,
      next: c,
    };
  }

  if (ex.claim_number && !c.primary.claimVerified) {
    next.primary.claimVerified = true;
    changes.push(`Mark claim ${c.primary.claimNumber} as confirmed by the carrier.`);
  }
  if (ex.policy_limit_cents && ex.policy_limit_cents !== c.primary.limitCents) {
    next.primary.limitCents = ex.policy_limit_cents;
    changes.push(`Change the policy limit from ${formatUsd(c.primary.limitCents)} to ${formatUsd(ex.policy_limit_cents)}.`);
  }
  const adj = ex.adjuster ?? {};
  if (adj.name && adj.name !== c.primary.adjuster.name) {
    next.primary.adjuster = {
      name: adj.name,
      phone: adj.phone ?? c.primary.adjuster.phone,
      email: adj.email ?? c.primary.adjuster.email,
    };
    changes.push(`Update the adjuster to ${adj.name}.`);
  }

  // Payments: match the clinic's by date of service, add other providers' if not already recorded.
  const added: PrimaryPayment[] = [];
  for (const p of ex.payments ?? []) {
    const ours = sameParty(p.payee, c.clinic);
    if (ours) {
      const visit = next.visits.find(
        (v) => v.date === p.date_of_service && !next.payments.some((x) => x.visitId === v.id),
      );
      if (!visit) continue;
      added.push({ id: `${visit.id}-pay-${p.date}`, date: p.date, amountCents: p.amount_cents, visitId: visit.id, payee: c.clinic, source: docName });
      next.payments.push(added[added.length - 1]);
    } else {
      const known = next.payments.some(
        (x) => !x.visitId && x.amountCents === p.amount_cents && sameParty(x.payee, p.payee),
      );
      if (known) continue;
      added.push({ id: `other-${p.date}-${p.amount_cents}`, date: p.date, amountCents: p.amount_cents, payee: p.payee, source: docName });
      next.payments.push(added[added.length - 1]);
    }
  }
  if (added.length) {
    const total = added.reduce((t, p) => t + p.amountCents, 0);
    const others = added.filter((p) => !p.visitId).length;
    changes.push(
      `Record ${added.length} carrier payment${added.length === 1 ? "" : "s"} totalling ${formatUsd(total)}${others ? `, ${others} of them to other providers` : ""}.`,
    );
  }

  if (ex.exhausted && ex.document_kind === "exhaustion_letter" && !c.primary.exhaustionLetterOn) {
    next.primary.exhaustionLetterOn = today;
    changes.push(
      `File the exhaustion letter${ex.exhaustion_date ? ` (benefits exhausted ${ex.exhaustion_date})` : ""} and release the unpaid visits to ${c.secondary.payer}.`,
    );
  }

  next.documents.push({ id: `doc-${Date.now()}`, kind: ex.document_kind, name: docName, addedOn: today, note: ex.notes });
  next.timeline.push({
    id: `t-${Date.now()}`,
    date: today,
    by: "agent",
    text: `${KIND_LABEL[ex.document_kind]} read and filed: ${docName}.${changes.length ? "" : " Nothing new in it."}`,
  });
  return { changes, next };
}
