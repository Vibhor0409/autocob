// Run with: node --test lib/ledger.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { computeLedger, formatUsd, addDays, daysBetween } from "./ledger.ts";
import { SAMPLE_CASES, DEMO_TODAY } from "./sample-cases.ts";
import type { AccidentCase } from "./types.ts";

const byId = (id: string): AccidentCase => structuredClone(SAMPLE_CASES.find((c) => c.id === id)!);

test("formats cents without floating point", () => {
  assert.equal(formatUsd(1_000_000), "$10,000.00");
  assert.equal(formatUsd(5), "$0.05");
  assert.equal(formatUsd(-31_500), "-$315.00");
});

test("date helpers", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(daysBetween("2026-11-19", "2026-12-19"), 30);
});

test("other providers draw on the same limit", () => {
  const l = computeLedger(byId("alvarez"), DEMO_TODAY);
  assert.equal(l.paidToOthersCents, 559_000);
  assert.equal(l.paidToClinicCents, 14 * 31_500);
  assert.equal(l.paidTotalCents, 1_000_000);
  assert.equal(l.remainingCents, 0);
  assert.equal(l.exhausted, true);
});

test("exhausted without a letter blocks the unpaid visits", () => {
  const l = computeLedger(byId("alvarez"), DEMO_TODAY);
  assert.equal(l.letterOnFile, false);
  assert.equal(l.blockedCents, 4 * 31_500);
  assert.equal(l.lines.filter((x) => x.status === "blocked_no_letter").length, 4);
  assert.equal(l.nextAction.kind, "request_exhaustion_letter");
  assert.equal(l.nextAction.urgent, true);
});

test("filing the letter releases the same visits", () => {
  const c = byId("alvarez");
  c.primary.exhaustionLetterOn = "2026-11-19";
  const l = computeLedger(c, DEMO_TODAY);
  assert.equal(l.blockedCents, 0);
  assert.equal(l.secondaryBalanceCents, 4 * 31_500);
  assert.equal(l.nextAction.kind, "assemble_packet");
});

test("a letter settles exhaustion even when our payment records lag", () => {
  const c = byId("alvarez");
  c.payments = c.payments.filter((p) => p.visitId); // drop what we know of other providers
  c.primary.exhaustionLetterOn = "2026-11-19";
  const l = computeLedger(c, DEMO_TODAY);
  assert.ok(l.remainingCents > 0);
  assert.equal(l.exhausted, true);
});

test("warns when about one paid visit of benefit is left", () => {
  const l = computeLedger(byId("okafor"), DEMO_TODAY);
  assert.equal(l.remainingCents, 500_000 - 268_000 - 7 * 26_000);
  assert.equal(l.visitsUntilExhaustion, 1);
  assert.equal(l.nextAction.kind, "request_payout_log");
  assert.equal(l.lines.filter((x) => x.status === "waiting_on_primary").length, 2);
});

test("unverified claim comes first", () => {
  assert.equal(computeLedger(byId("raman"), DEMO_TODAY).nextAction.kind, "verify_claim");
});

test("packet is urgent when a filing deadline is within 30 days", () => {
  const l = computeLedger(byId("greene"), DEMO_TODAY);
  assert.equal(l.nextAction.kind, "assemble_packet");
  const ready = l.lines.filter((x) => x.status === "ready_for_secondary");
  assert.equal(ready.length, 7);
  assert.equal(ready[0].filingDeadline, addDays(ready[0].visit.date, 120));
  assert.equal(l.nextAction.urgent, ready[0].daysToDeadline <= 30);
});

test("submitted visits leave the open balance", () => {
  const c = byId("greene");
  for (const v of c.visits.slice(5)) v.secondarySubmittedOn = DEMO_TODAY;
  const l = computeLedger(c, DEMO_TODAY);
  assert.equal(l.secondaryBalanceCents, 0);
  assert.equal(l.nextAction.kind, "none");
});

test("payments never push remaining below zero", () => {
  const c = byId("okafor");
  c.payments.push({ id: "x", date: "2026-11-01", amountCents: 900_000, payee: "Other", source: "test" });
  assert.equal(computeLedger(c, DEMO_TODAY).remainingCents, 0);
});
