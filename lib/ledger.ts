// The benefit ledger. Pure functions, integer cents, no model involved: money math is never
// left to an agent.
import type { AccidentCase, Visit } from "./types";

export type VisitStatus =
  | "paid_by_primary"
  | "waiting_on_primary"
  | "ready_for_secondary"
  | "blocked_no_letter"
  | "sent_to_secondary";

export interface VisitLine {
  visit: Visit;
  primaryPaidCents: number;
  balanceCents: number;
  status: VisitStatus;
  /** Last day the health plan accepts this claim. */
  filingDeadline: string;
  daysToDeadline: number;
}

export type ActionKind =
  | "verify_claim"
  | "request_payout_log"
  | "request_exhaustion_letter"
  | "assemble_packet"
  | "filing_deadline"
  | "none";

export interface NextAction {
  kind: ActionKind;
  title: string;
  detail: string;
  urgent: boolean;
}

export interface Ledger {
  limitCents: number;
  paidToClinicCents: number;
  paidToOthersCents: number;
  paidTotalCents: number;
  remainingCents: number;
  usedRatio: number;
  exhausted: boolean;
  letterOnFile: boolean;
  billedCents: number;
  waitingOnPrimaryCents: number;
  secondaryBalanceCents: number;
  /** Cash that cannot move until the exhaustion letter arrives. */
  blockedCents: number;
  avgPaidPerVisitCents: number;
  /** Paid visits the remaining benefit still covers at the current average; null if unknown. */
  visitsUntilExhaustion: number | null;
  lines: VisitLine[];
  nextAction: NextAction;
}

const DAY = 86_400_000;

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Date(d.getTime() + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / DAY);
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rest}`;
}

export function computeLedger(c: AccidentCase, today: string): Ledger {
  const limitCents = c.primary.limitCents;
  let paidToClinicCents = 0;
  let paidToOthersCents = 0;
  const paidByVisit = new Map<string, number>();
  for (const p of c.payments) {
    if (p.visitId) {
      paidToClinicCents += p.amountCents;
      paidByVisit.set(p.visitId, (paidByVisit.get(p.visitId) ?? 0) + p.amountCents);
    } else {
      paidToOthersCents += p.amountCents;
    }
  }
  const paidTotalCents = paidToClinicCents + paidToOthersCents;
  const remainingCents = Math.max(0, limitCents - paidTotalCents);
  const letterOnFile = Boolean(c.primary.exhaustionLetterOn);
  // A letter from the carrier settles it even if our own records lag behind theirs.
  const exhausted = letterOnFile || remainingCents === 0;

  const visits = [...c.visits].sort((a, b) => a.date.localeCompare(b.date));
  const lines: VisitLine[] = visits.map((visit) => {
    const primaryPaidCents = paidByVisit.get(visit.id) ?? 0;
    const balanceCents = Math.max(0, visit.billedCents - primaryPaidCents);
    const filingDeadline = addDays(visit.date, c.secondary.timelyFilingDays);
    let status: VisitStatus;
    if (visit.secondarySubmittedOn) status = "sent_to_secondary";
    else if (balanceCents === 0) status = "paid_by_primary";
    else if (!exhausted) status = "waiting_on_primary";
    else if (letterOnFile) status = "ready_for_secondary";
    else status = "blocked_no_letter";
    return {
      visit,
      primaryPaidCents,
      balanceCents,
      status,
      filingDeadline,
      daysToDeadline: daysBetween(today, filingDeadline),
    };
  });

  const sum = (pick: (l: VisitLine) => number) => lines.reduce((t, l) => t + pick(l), 0);
  const billedCents = sum((l) => l.visit.billedCents);
  const waitingOnPrimaryCents = sum((l) => (l.status === "waiting_on_primary" ? l.balanceCents : 0));
  const blockedCents = sum((l) => (l.status === "blocked_no_letter" ? l.balanceCents : 0));
  const readyCents = sum((l) => (l.status === "ready_for_secondary" ? l.balanceCents : 0));
  const secondaryBalanceCents = blockedCents + readyCents;

  const paidVisits = lines.filter((l) => l.primaryPaidCents > 0);
  const avgPaidPerVisitCents = paidVisits.length
    ? Math.round(paidToClinicCents / paidVisits.length)
    : 0;
  const visitsUntilExhaustion =
    exhausted || avgPaidPerVisitCents === 0
      ? exhausted
        ? 0
        : null
      : Math.floor(remainingCents / avgPaidPerVisitCents);

  const ledger: Omit<Ledger, "nextAction"> = {
    limitCents,
    paidToClinicCents,
    paidToOthersCents,
    paidTotalCents,
    remainingCents,
    usedRatio: limitCents > 0 ? Math.min(1, paidTotalCents / limitCents) : 0,
    exhausted,
    letterOnFile,
    billedCents,
    waitingOnPrimaryCents,
    secondaryBalanceCents,
    blockedCents,
    avgPaidPerVisitCents,
    visitsUntilExhaustion,
    lines,
  };
  return { ...ledger, nextAction: pickNextAction(c, ledger) };
}

function pickNextAction(c: AccidentCase, l: Omit<Ledger, "nextAction">): NextAction {
  const open = l.lines.filter(
    (x) => x.status === "ready_for_secondary" || x.status === "blocked_no_letter",
  );
  const soonest = open.reduce<VisitLine | null>(
    (min, x) => (!min || x.daysToDeadline < min.daysToDeadline ? x : min),
    null,
  );
  const coverage = c.primary.coverage === "WorkersComp" ? "workers' comp" : c.primary.coverage;

  if (!c.primary.claimVerified) {
    return {
      kind: "verify_claim",
      title: "Verify the claim with the adjuster",
      detail: `Confirm ${c.primary.carrier} accepted claim ${c.primary.claimNumber} and the ${coverage} limit before billing more visits.`,
      urgent: false,
    };
  }
  if (l.exhausted && !l.letterOnFile) {
    return {
      kind: "request_exhaustion_letter",
      title: "Request the exhaustion letter",
      detail: `${coverage} benefits are used up. ${formatUsd(l.blockedCents)} cannot go to ${c.secondary.payer} until ${c.primary.carrier} confirms exhaustion in writing.`,
      urgent: true,
    };
  }
  if (l.exhausted && l.letterOnFile && open.length > 0) {
    const tight = soonest !== null && soonest.daysToDeadline <= 30;
    return {
      kind: "assemble_packet",
      title: "Send the secondary packet",
      detail: `${open.length} visit${open.length === 1 ? "" : "s"} totalling ${formatUsd(l.secondaryBalanceCents)} are ready for ${c.secondary.payer}.${
        tight && soonest
          ? soonest.daysToDeadline < 0
            ? ` The earliest filing deadline passed ${-soonest.daysToDeadline} days ago.`
            : ` The earliest filing deadline is in ${soonest.daysToDeadline} day${soonest.daysToDeadline === 1 ? "" : "s"}.`
          : ""
      }`,
      urgent: tight,
    };
  }
  if (!l.exhausted && l.visitsUntilExhaustion !== null && l.visitsUntilExhaustion <= 2) {
    return {
      kind: "request_payout_log",
      title: "Pull the carrier's payout log",
      detail: `About ${l.visitsUntilExhaustion} paid visit${l.visitsUntilExhaustion === 1 ? "" : "s"} of benefit left (${formatUsd(l.remainingCents)}). Other providers draw on the same limit, so confirm the balance with ${c.primary.carrier} now.`,
      urgent: true,
    };
  }
  return {
    kind: "none",
    title: "Nothing waiting on you",
    detail: l.exhausted
      ? "Every balance on this case has been sent or paid."
      : `${formatUsd(l.remainingCents)} of ${coverage} benefit remains.`,
    urgent: false,
  };
}
