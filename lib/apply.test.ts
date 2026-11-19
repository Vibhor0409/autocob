// Run with: node --test lib/apply.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { proposeChanges } from "./apply.ts";
import { computeLedger } from "./ledger.ts";
import { DEMO_TODAY, SAMPLE_CASES } from "./sample-cases.ts";
import { SAMPLE_DOCS } from "./sample-readings.ts";

const caseOf = (id: string) => structuredClone(SAMPLE_CASES.find((c) => c.id === id)!);
const reading = (file: string) => SAMPLE_DOCS.find((s) => s.file === file)!.reading;

test("a document for another claim is refused and changes nothing", () => {
  const c = caseOf("alvarez");
  const p = proposeChanges(c, reading("wrong-claim-letter.pdf"), "wrong-claim-letter.pdf", DEMO_TODAY);
  assert.match(p.blocked ?? "", /BMA-26-0999999/);
  assert.deepEqual(p.next, c);
});

test("a document from another carrier is refused", () => {
  const p = proposeChanges(caseOf("alvarez"), { ...reading("okafor-exhaustion-letter.pdf"), claim_number: undefined }, "x.pdf", DEMO_TODAY);
  assert.match(p.blocked ?? "", /Northgate Casualty/);
});

test("exhaustion letter releases the stuck visits", () => {
  const p = proposeChanges(caseOf("alvarez"), reading("alvarez-exhaustion-letter.pdf"), "alvarez-exhaustion-letter.pdf", DEMO_TODAY);
  assert.equal(p.blocked, undefined);
  const l = computeLedger(p.next, DEMO_TODAY);
  assert.equal(l.blockedCents, 0);
  assert.equal(l.nextAction.kind, "assemble_packet");
  assert.equal(p.next.documents.at(-1)?.kind, "exhaustion_letter");
});

test("payout log adds only the payment not already on file", () => {
  const c = caseOf("okafor");
  const p = proposeChanges(c, reading("okafor-payout-log.pdf"), "okafor-payout-log.pdf", DEMO_TODAY);
  assert.equal(p.next.payments.length, c.payments.length + 1);
  const l = computeLedger(p.next, DEMO_TODAY);
  assert.equal(l.remainingCents, 0);
  assert.equal(l.nextAction.kind, "request_exhaustion_letter");
});

test("reading the same payout log twice adds nothing more", () => {
  const once = proposeChanges(caseOf("okafor"), reading("okafor-payout-log.pdf"), "a.pdf", DEMO_TODAY).next;
  const twice = proposeChanges(once, reading("okafor-payout-log.pdf"), "a.pdf", DEMO_TODAY);
  assert.equal(twice.next.payments.length, once.payments.length);
});

test("claim acknowledgement confirms the claim and sets the adjuster", () => {
  const p = proposeChanges(caseOf("raman"), reading("raman-claim-acknowledgement.pdf"), "ack.pdf", DEMO_TODAY);
  assert.equal(p.next.primary.claimVerified, true);
  assert.equal(p.next.primary.adjuster.name, "Maya Lindqvist");
});
