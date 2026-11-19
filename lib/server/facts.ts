// Turns the browser's case summary into the plain fact lines the agent reads.
// Everything is validated and length-capped here: the browser never writes the prompt itself.
import "server-only";

const line = (v: unknown, max = 120): string =>
  typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : "";
const cents = (v: unknown): number | null =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e10 ? (v as number) : null;
const usd = (c: number): string =>
  `$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
const iso = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export interface CaseFacts {
  caseId: string;
  text: string;
}

export function buildFacts(raw: unknown, forLetter: boolean): CaseFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const caseId = line(o.caseId, 40);
  const patient = line(o.patient);
  const carrier = line(o.carrier);
  const claim = line(o.claimNumber, 60);
  if (!caseId || !patient || !carrier || !claim) return null;

  const rows: string[] = [
    "Case facts (from the clinic's records):",
    `Patient: ${patient}`,
    `Clinic: ${line(o.clinic)}`,
    `Primary carrier: ${carrier}`,
    `Coverage: ${line(o.coverage, 20)}`,
    `Claim number: ${claim}`,
  ];
  const limit = cents(o.limitCents);
  if (limit !== null) rows.push(`Policy limit: ${usd(limit)} (${limit} cents)`);

  if (forLetter) {
    const total = cents(o.secondaryBalanceCents);
    const visits = Array.isArray(o.visits) ? o.visits.slice(0, 60) : [];
    const dates = visits
      .map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {}))
      .map((v) => ({ date: iso(v.date), billed: cents(v.billedCents) }))
      .filter((v) => v.date && v.billed !== null);
    if (total === null || dates.length === 0) return null;
    const enclosures = (Array.isArray(o.enclosures) ? o.enclosures : [])
      .slice(0, 12)
      .map((e) => line(e, 80))
      .filter(Boolean);
    rows.push(
      `Secondary health plan: ${line(o.secondaryPayer)}`,
      `Member ID: ${line(o.memberId, 40)}`,
      `Exhaustion confirmed on: ${iso(o.exhaustionDate) || "see enclosed letter"}`,
      `Dates of service to process (${dates.length}): ${dates.map((d) => `${d.date} ${usd(d.billed as number)}`).join("; ")}`,
      `Total billed for these dates: ${usd(total)}`,
      `Prior denial reason: ${line(o.denialReason, 80) || "none recorded"}`,
      `Enclosures: ${enclosures.join("; ")}`,
    );
  }
  return { caseId, text: rows.join("\n") };
}
