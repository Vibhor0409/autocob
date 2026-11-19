// Rebuilds a case from untrusted input, keeping only fields of the expected type and size.
// The server runs this on every save, so nothing a browser sends is stored as-is.
import type { AccidentCase, CaseDocument, CoverageType, DocKind, PrimaryPayment, TimelineEvent, Visit } from "./types";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f]+/g, " ").trim().slice(0, max) : "";
const iso = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const cents = (v: unknown): number => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e10 ? (v as number) : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const id = (v: unknown): string => str(v, 80).replace(/[^A-Za-z0-9_.:-]/g, "");

const COVERAGE: CoverageType[] = ["PIP", "MedPay", "WorkersComp"];
const ACCIDENTS = ["Auto accident", "Workplace injury", "Slip and fall"] as const;
const KINDS: DocKind[] = ["accident_report", "primary_eob", "payout_log", "exhaustion_letter", "adjuster_letter", "other"];
const BY = ["agent", "staff", "system"] as const;

export function cleanCase(raw: unknown): AccidentCase | null {
  const o = obj(raw);
  const patient = obj(o.patient);
  const primary = obj(o.primary);
  const adjuster = obj(primary.adjuster);
  const secondary = obj(o.secondary);
  const caseId = id(o.id);
  const name = str(patient.name, 120);
  if (!caseId || !name || !str(primary.carrier, 120) || !str(primary.claimNumber, 60)) return null;

  const visits: Visit[] = list(o.visits, 500)
    .map(obj)
    .filter((v) => id(v.id) && iso(v.date))
    .map((v) => ({
      id: id(v.id),
      date: iso(v.date),
      service: str(v.service, 120) || "Office visit",
      billedCents: cents(v.billedCents),
      ...(iso(v.secondarySubmittedOn) ? { secondarySubmittedOn: iso(v.secondarySubmittedOn) } : {}),
    }));
  const visitIds = new Set(visits.map((v) => v.id));

  const payments: PrimaryPayment[] = list(o.payments, 1000)
    .map(obj)
    .filter((p) => id(p.id) && iso(p.date))
    .map((p) => ({
      id: id(p.id),
      date: iso(p.date),
      amountCents: cents(p.amountCents),
      payee: str(p.payee, 120) || "Unknown payee",
      source: str(p.source, 160),
      ...(visitIds.has(id(p.visitId)) ? { visitId: id(p.visitId) } : {}),
    }));

  const documents: CaseDocument[] = list(o.documents, 300)
    .map(obj)
    .filter((d) => id(d.id) && str(d.name, 200))
    .map((d) => {
      const sample = str(d.sampleUrl, 200);
      return {
        id: id(d.id),
        kind: KINDS.find((k) => k === d.kind) ?? "other",
        name: str(d.name, 200),
        addedOn: iso(d.addedOn),
        ...(/^\/samples\/[A-Za-z0-9._-]+\.pdf$/.test(sample) ? { sampleUrl: sample } : {}),
        ...(str(d.note, 600) ? { note: str(d.note, 600) } : {}),
      };
    });

  const timeline: TimelineEvent[] = list(o.timeline, 1000)
    .map(obj)
    .filter((t) => id(t.id) && str(t.text, 400))
    .map((t) => ({ id: id(t.id), date: iso(t.date), text: str(t.text, 400), by: BY.find((b) => b === t.by) ?? "staff" }));

  const days = Number(secondary.timelyFilingDays);
  const thread = str(o.agentThread, 2000);
  return {
    id: caseId,
    patient: { name, dob: iso(patient.dob) },
    clinic: str(o.clinic, 120),
    injuryDate: iso(o.injuryDate),
    accident: ACCIDENTS.find((a) => a === o.accident) ?? "Auto accident",
    primary: {
      carrier: str(primary.carrier, 120),
      coverage: COVERAGE.find((c) => c === primary.coverage) ?? "PIP",
      claimNumber: str(primary.claimNumber, 60),
      limitCents: cents(primary.limitCents),
      adjuster: { name: str(adjuster.name, 120), phone: str(adjuster.phone, 40), email: str(adjuster.email, 160) },
      claimVerified: primary.claimVerified === true,
      ...(iso(primary.exhaustionLetterOn) ? { exhaustionLetterOn: iso(primary.exhaustionLetterOn) } : {}),
    },
    secondary: {
      payer: str(secondary.payer, 120),
      memberId: str(secondary.memberId, 60),
      timelyFilingDays: Number.isInteger(days) && days >= 30 && days <= 730 ? days : 180,
    },
    visits,
    payments,
    documents,
    timeline,
    ...(thread ? { agentThread: thread } : {}),
  };
}
