"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BenefitBar } from "./BenefitBar";
import { AddVisit, CaseSteps, Glossary, NewCase } from "./CaseParts";
import { SAMPLE_DOCS, sampleReading } from "@/lib/sample-readings.ts";
import { KIND_LABEL, proposeChanges, type Proposal } from "@/lib/apply.ts";
import { computeLedger, formatUsd, type Ledger, type VisitStatus } from "@/lib/ledger.ts";
import { buildPacket, type Enclosure } from "@/lib/packet.ts";
import { getFile, loadCases, putFile, resetCases, saveCases } from "@/lib/store.ts";
import type { AccidentCase, Extraction } from "@/lib/types";

const STATUS: Record<VisitStatus, { label: string; cls: string }> = {
  paid_by_primary: { label: "Paid by carrier", cls: "bg-wash-paid text-paid" },
  waiting_on_primary: { label: "Waiting on carrier", cls: "bg-wash-wait text-wait" },
  blocked_no_letter: { label: "Stuck: no letter", cls: "bg-wash-red text-form-red" },
  ready_for_secondary: { label: "Ready for health plan", cls: "bg-wash-plan text-plan" },
  sent_to_secondary: { label: "Sent to health plan", cls: "bg-paper text-ink-2" },
};

const GUIDE_KEY = "autocob.guide.dismissed";

type Reading =
  | { phase: "idle" }
  | { phase: "working"; fileName: string; note: string }
  | { phase: "review"; fileName: string; bytes: Uint8Array; extraction: Extraction; proposal: Proposal; thread?: string; sample: boolean }
  | { phase: "error"; message: string };

const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Most urgent first, then the most money waiting on the health plan. */
function rank(cases: AccidentCase[], today: string): string[] {
  return cases
    .map((c) => ({ id: c.id, l: computeLedger(c, today) }))
    .sort((a, b) => Number(b.l.nextAction.urgent) - Number(a.l.nextAction.urgent) || b.l.secondaryBalanceCents - a.l.secondaryBalanceCents)
    .map((x) => x.id);
}

/** HarnessRouter's free plan runs two tasks at a time; a busy answer is worth waiting out. */
async function startTask(url: string, init: RequestInit, alive: () => boolean, onBusy: () => void) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const body = await res.json();
    if (res.ok) return body.task as string;
    if ((res.status !== 429 && res.status !== 409) || attempt >= 5 || !alive()) {
      throw new Error(body.message ?? "The request could not be sent.");
    }
    onBusy();
    await sleep(20_000);
  }
}

async function pollTask(task: string, alive: () => boolean) {
  for (let i = 0; alive(); i++) {
    await sleep(i < 20 ? 3000 : 8000);
    const res = await fetch(`/api/agent/task?t=${encodeURIComponent(task)}`, { cache: "no-store" });
    const view = await res.json();
    if (!res.ok) throw new Error(view.message ?? "The agent could not be reached.");
    if (view.status !== "working") return view;
    if (i > 80) throw new Error("The agent is taking too long. Try again.");
  }
  return null;
}

export function Workspace() {
  const [cases, setCases] = useState<AccidentCase[] | null>(null);
  const [today, setToday] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [reading, setReading] = useState<Reading>({ phase: "idle" });
  const [packet, setPacket] = useState<{ busy: boolean; note?: string; url?: string; name?: string }>({ busy: false });
  const [showDraft, setShowDraft] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [guide, setGuide] = useState(false);
  const [dragging, setDragging] = useState(false);
  const run = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Browser storage and the clock only exist after mount, so the first paint is the shell.
    void Promise.resolve().then(() => {
      const loaded = loadCases();
      const now = localToday();
      const ids = rank(loaded, now);
      setCases(loaded);
      setToday(now);
      setOrder(ids);
      setSelectedId(ids[0] ?? "");
      try {
        setGuide(localStorage.getItem(GUIDE_KEY) !== "1");
      } catch {
        setGuide(true);
      }
    });
    fetch("/api/agent/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setConnected(Boolean(j.connected)))
      .catch(() => setConnected(false));
  }, []);

  const ledgers = useMemo(() => {
    const m = new Map<string, Ledger>();
    if (cases && today) for (const c of cases) m.set(c.id, computeLedger(c, today));
    return m;
  }, [cases, today]);

  // The list is ranked once when the workspace opens, so a case does not jump while it is worked.
  const sorted = useMemo(() => {
    if (!cases) return [];
    const pos = new Map(order.map((id, i) => [id, i]));
    return [...cases].sort((a, b) => (pos.get(a.id) ?? -1) - (pos.get(b.id) ?? -1));
  }, [cases, order]);

  const current = cases?.find((c) => c.id === selectedId) ?? null;
  const ledger = current ? ledgers.get(current.id)! : null;

  const select = (id: string) => {
    run.current += 1; // abandon any in-flight polling for the previous case
    setSelectedId(id);
    setReading({ phase: "idle" });
    setPacket({ busy: false });
    setShowDraft(false);
  };

  const update = useCallback((next: AccidentCase) => {
    setCases((prev) => {
      const all = (prev ?? []).map((c) => (c.id === next.id ? next : c));
      saveCases(all);
      return all;
    });
  }, []);

  const caseSummary = (c: AccidentCase) => ({
    caseId: c.id,
    patient: c.patient.name,
    clinic: c.clinic,
    carrier: c.primary.carrier,
    coverage: c.primary.coverage,
    claimNumber: c.primary.claimNumber,
    limitCents: c.primary.limitCents,
  });

  async function readDocument(file: File) {
    if (!current) return;
    const c = current;
    const mine = ++run.current;
    const alive = () => run.current === mine;
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      if (connected) {
        setReading({ phase: "working", fileName: file.name, note: "The case agent is reading the document. This usually takes under a minute." });
        const form = new FormData();
        form.set("file", file);
        form.set("case", JSON.stringify(caseSummary(c)));
        if (c.agentThread) form.set("thread", c.agentThread);
        const task = await startTask("/api/agent/read", { method: "POST", body: form }, alive, () =>
          setReading({ phase: "working", fileName: file.name, note: "The case agent is finishing another task. This one starts in a moment." }),
        );
        const view = await pollTask(task, alive);
        if (!view || !alive()) return;
        if (view.status !== "done" || !view.extraction) throw new Error(view.message ?? "The agent could not read this document.");
        setReading({
          phase: "review",
          fileName: file.name,
          bytes,
          extraction: view.extraction,
          proposal: proposeChanges(c, view.extraction, file.name, today),
          thread: view.thread,
          sample: false,
        });
      } else {
        const sample = sampleReading(file.name);
        if (!sample) {
          throw new Error("The case agent is not connected, so it can only read the sample documents for now. Try one from the Documents section.");
        }
        setReading({ phase: "working", fileName: file.name, note: "Loading the sample reading." });
        await sleep(900);
        if (!alive()) return;
        setReading({ phase: "review", fileName: file.name, bytes, extraction: sample, proposal: proposeChanges(c, sample, file.name, today), sample: true });
      }
    } catch (err) {
      if (alive()) setReading({ phase: "error", message: err instanceof Error ? err.message : "Something went wrong reading the document." });
    }
  }

  async function approve() {
    if (reading.phase !== "review" || !current) return;
    const next = { ...reading.proposal.next, agentThread: reading.thread ?? current.agentThread };
    const doc = next.documents[next.documents.length - 1];
    if (doc) await putFile(doc.id, reading.bytes);
    update(next);
    setReading({ phase: "idle" });
  }

  async function trySample(file: string) {
    const res = await fetch(`/samples/${file}`);
    const blob = await res.blob();
    await readDocument(new File([blob], file, { type: "application/pdf" }));
  }

  function addVisit(date: string, cents: number, service: string) {
    if (!current) return;
    const next = structuredClone(current);
    next.visits.push({ id: uid("v"), date, service, billedCents: cents });
    next.timeline.push({ id: uid("t"), date: today, by: "staff", text: `Visit on ${date} added, ${formatUsd(cents)} billed.` });
    update(next);
  }

  function createCase(c: AccidentCase) {
    setCases((prev) => {
      const all = [...(prev ?? []), c];
      saveCases(all);
      return all;
    });
    setOrder((prev) => [c.id, ...prev]);
    select(c.id);
  }

  function dismissGuide() {
    setGuide(false);
    try {
      localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      // stays dismissed for this session only
    }
  }

  function recordLetterByHand() {
    if (!current) return;
    const next = structuredClone(current);
    next.primary.exhaustionLetterOn = today;
    next.timeline.push({ id: uid("t"), date: today, by: "staff", text: "Exhaustion letter recorded by hand." });
    update(next);
    setReading({ phase: "idle" });
  }

  function markVerified() {
    if (!current) return;
    const next = structuredClone(current);
    next.primary.claimVerified = true;
    next.timeline.push({ id: uid("t"), date: today, by: "staff", text: "Claim confirmed with the carrier." });
    update(next);
  }

  async function makePacket(withAgentLetter: boolean) {
    if (!current || !ledger) return;
    const c = current;
    const mine = ++run.current;
    const alive = () => run.current === mine;
    setPacket({ busy: true, note: withAgentLetter ? "The case agent is drafting the cover letter." : "Assembling the packet." });
    try {
      const wanted = c.documents.filter((d) => ["exhaustion_letter", "payout_log", "primary_eob"].includes(d.kind));
      const enclosures: Enclosure[] = [];
      const missing: string[] = [];
      for (const d of wanted) {
        let bytes = await getFile(d.id);
        if (!bytes && d.sampleUrl) bytes = new Uint8Array(await (await fetch(d.sampleUrl)).arrayBuffer());
        if (bytes) enclosures.push({ name: `${KIND_LABEL[d.kind]}: ${d.name}`, bytes });
        else missing.push(d.name);
      }
      let letter: string | undefined;
      let thread = c.agentThread;
      if (withAgentLetter) {
        const open = ledger.lines.filter((l) => l.status === "ready_for_secondary");
        const task = await startTask("/api/agent/letter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread,
            case: {
              ...caseSummary(c),
              secondaryPayer: c.secondary.payer,
              memberId: c.secondary.memberId,
              exhaustionDate: c.primary.exhaustionLetterOn,
              secondaryBalanceCents: ledger.secondaryBalanceCents,
              visits: open.map((l) => ({ date: l.visit.date, billedCents: l.visit.billedCents })),
              denialReason: c.timeline.some((t) => t.text.includes("CARC 22")) ? "CARC 22" : "",
              enclosures: ["Visit ledger", ...enclosures.map((e) => e.name)],
            },
          }),
        }, alive, () =>
          setPacket({ busy: true, note: "The case agent is finishing another task. The letter starts in a moment." }),
        );
        const view = await pollTask(task, alive);
        if (!view || !alive()) return;
        if (view.status !== "done" || !view.letter) throw new Error(view.message ?? "The agent could not draft the letter.");
        letter = view.letter;
        thread = view.thread ?? thread;
      }
      const { bytes, skipped } = await buildPacket({ c, ledger, today, letter, enclosures });
      if (!alive()) return;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const name = `Secondary packet - ${c.patient.name} - ${today}.pdf`;
      const left = [...missing, ...skipped];
      setPacket({
        busy: false,
        url,
        name,
        note: left.length ? `Not included, attach by hand: ${left.join(", ")}.` : `${enclosures.length} enclosure${enclosures.length === 1 ? "" : "s"} attached.`,
      });
      if (thread !== c.agentThread) update({ ...c, agentThread: thread });
    } catch (err) {
      if (alive()) setPacket({ busy: false, note: err instanceof Error ? err.message : "The packet could not be built." });
    }
  }

  function markSent() {
    if (!current || !ledger) return;
    const next = structuredClone(current);
    const ready = new Set(ledger.lines.filter((l) => l.status === "ready_for_secondary").map((l) => l.visit.id));
    for (const v of next.visits) if (ready.has(v.id)) v.secondarySubmittedOn = today;
    next.timeline.push({
      id: uid("t"),
      date: today,
      by: "staff",
      text: `Secondary packet sent to ${next.secondary.payer}: ${ready.size} visits, ${formatUsd(ledger.secondaryBalanceCents)}.`,
    });
    update(next);
    setPacket({ busy: false });
  }

  if (!cases || !today) {
    return <div className="p-10 text-sm text-ink-2">Opening the workspace.</div>;
  }

  const stuckTotal = [...ledgers.values()].reduce((t, l) => t + l.blockedCents, 0);
  const filed = new Set(current?.documents.map((d) => d.name));
  const unusedSamples = SAMPLE_DOCS.filter((s) => s.forCase === current?.id && !filed.has(s.file));
  const misfiled = SAMPLE_DOCS.find((s) => s.forCase === "any");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-sheet px-4 py-3 sm:px-6">
        <Link href="/" className="text-[17px] font-bold tracking-tight">
          Auto<span className="text-form-red">COB</span>
        </Link>
        <span className="text-sm text-ink-2">Eastbay Motion Physical Therapy</span>
        <span className="ml-auto flex items-center gap-2 text-[12px] text-ink-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-paid" : connected === false ? "bg-wait" : "bg-line"}`}
            aria-hidden
          />
          {connected === null ? "Checking the case agent" : connected ? "Case agent connected" : "Case agent not connected: sample readings only"}
        </span>
        <button
          type="button"
          onClick={() => {
            const fresh = resetCases();
            const ids = rank(fresh, today);
            setCases(fresh);
            setOrder(ids);
            select(ids[0]);
          }}
          className="rounded border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:border-ink hover:text-ink"
        >
          Reset sample data
        </button>
        <NewCase clinic="Eastbay Motion Physical Therapy" today={today} onCreate={createCase} />
      </header>

      <div className="border-b border-line bg-wash-wait px-4 py-1.5 text-[12px] text-wait sm:px-6">
        Demo workspace. Every patient, carrier and amount is fictional. Do not upload real patient records.
      </div>

      {guide && (
        <div className="border-b border-line bg-wash-plan px-4 py-3 text-sm sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
              <p className="font-semibold">Try it in three clicks</p>
              <p className="mt-1 text-ink">
                Maria Alvarez has four visits stuck, because her auto benefit ran out and the carrier has not confirmed it in writing.
                Press <span className="font-medium">Use the sample: Exhaustion letter</span>, check what was read, then{" "}
                <span className="font-medium">Approve and file</span>. The visits turn blue, ready for the health plan, and you can
                build the packet.
              </p>
            </div>
            <button type="button" onClick={dismissGuide} className="rounded border border-plan/40 px-2.5 py-1 text-[12px] text-plan hover:border-plan">
              Got it
            </button>
          </div>
        </div>
      )}

      <div className="grid flex-1 lg:grid-cols-[21rem_1fr]">
        <nav aria-label="Cases" className="border-b border-line bg-sheet lg:border-r lg:border-b-0">
          <div className="flex items-baseline justify-between px-4 pt-4 pb-2 sm:px-5">
            <h2 className="text-[13px] font-semibold">Open cases</h2>
            {stuckTotal > 0 && (
              <span className="text-[12px] text-form-red">
                <span className="fig font-medium">{formatUsd(stuckTotal)}</span> stuck
              </span>
            )}
          </div>
          <ul>
            {sorted.map((c) => {
              const l = ledgers.get(c.id)!;
              const active = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => select(c.id)}
                    aria-current={active ? "true" : undefined}
                    className={`block w-full border-l-[3px] px-4 py-3 text-left sm:px-5 ${
                      active ? "border-ink bg-paper" : "border-transparent hover:bg-paper/60"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{c.patient.name}</span>
                      <span className="fig text-[12px] text-ink-2">{c.primary.coverage}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-2">{c.primary.carrier}</div>
                    <div className="mt-2.5">
                      <BenefitBar ledger={l} coverage={c.primary.coverage} compact />
                    </div>
                    <div className={`mt-2 text-[12px] ${l.nextAction.urgent ? "font-medium text-form-red" : "text-ink-2"}`}>
                      {l.nextAction.title}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {current && ledger && (
          <main className="min-w-0 px-4 py-6 sm:px-8">
            <div className="mx-auto max-w-4xl space-y-6">
              <section>
                <h1 className="text-2xl font-bold tracking-tight">{current.patient.name}</h1>
                <p className="mt-1 text-sm text-ink-2">
                  {current.accident} on <span className="fig">{current.injuryDate}</span>
                </p>
                <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[12px] text-ink-2">Pays first</dt>
                    <dd>
                      {current.primary.carrier}, {current.primary.coverage} claim{" "}
                      <span className="fig">{current.primary.claimNumber}</span>
                    </dd>
                    <dd className="text-[12px] text-ink-2">
                      Adjuster {current.primary.adjuster.name}, {current.primary.adjuster.phone}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-ink-2">Pays after the limit</dt>
                    <dd>
                      {current.secondary.payer}, member <span className="fig">{current.secondary.memberId}</span>
                    </dd>
                    <dd className="text-[12px] text-ink-2">Files within {current.secondary.timelyFilingDays} days of each visit</dd>
                  </div>
                </dl>
              </section>

              <CaseSteps c={current} ledger={ledger} />

              <section className="rounded-md border border-line bg-sheet p-5">
                <BenefitBar ledger={ledger} coverage={current.primary.coverage} />
                {ledger.visitsUntilExhaustion !== null && !ledger.exhausted && (
                  <p className="mt-3 text-[13px] text-ink-2">
                    At the current average of <span className="fig">{formatUsd(ledger.avgPaidPerVisitCents)}</span> a visit, the
                    remaining benefit covers about {ledger.visitsUntilExhaustion} more paid visit
                    {ledger.visitsUntilExhaustion === 1 ? "" : "s"}.
                  </p>
                )}
              </section>

              <section
                className={`rounded-md border p-5 ${ledger.nextAction.urgent ? "border-form-red/40 bg-wash-red" : "border-line bg-sheet"}`}
                aria-live="polite"
              >
                <p className="text-[12px] text-ink-2">Next step</p>
                <h2 className={`mt-0.5 text-lg font-semibold ${ledger.nextAction.urgent ? "text-form-red" : ""}`}>
                  {ledger.nextAction.title}
                </h2>
                <p className="mt-1 max-w-2xl text-sm">{ledger.nextAction.detail}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {ledger.nextAction.kind === "verify_claim" && (
                    <button type="button" onClick={markVerified} className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85">
                      Mark claim confirmed
                    </button>
                  )}
                  {(ledger.nextAction.kind === "request_exhaustion_letter" || ledger.nextAction.kind === "request_payout_log") && (
                    <>
                      <button type="button" onClick={() => fileInput.current?.click()} className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85">
                        {ledger.nextAction.kind === "request_exhaustion_letter" ? "Upload the letter" : "Upload the payout log"}
                      </button>
                      <button type="button" onClick={() => setShowDraft((v) => !v)} className="rounded border border-ink/30 bg-sheet px-3.5 py-2 text-sm hover:border-ink">
                        {showDraft ? "Hide request" : "Write the request to the adjuster"}
                      </button>
                    </>
                  )}
                  {unusedSamples[0] && ledger.nextAction.kind !== "assemble_packet" && ledger.nextAction.kind !== "none" && (
                    <button
                      type="button"
                      onClick={() => trySample(unusedSamples[0].file)}
                      className="rounded border border-ink/30 bg-sheet px-3.5 py-2 text-sm hover:border-ink"
                    >
                      Use the sample: {unusedSamples[0].title}
                    </button>
                  )}
                  {ledger.nextAction.kind === "assemble_packet" && (
                    <>
                      <button type="button" disabled={packet.busy} onClick={() => makePacket(false)} className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85 disabled:opacity-50">
                        Build the packet
                      </button>
                      {connected && (
                        <button type="button" disabled={packet.busy} onClick={() => makePacket(true)} className="rounded border border-ink/30 bg-sheet px-3.5 py-2 text-sm hover:border-ink disabled:opacity-50">
                          Build with an agent-written letter
                        </button>
                      )}
                    </>
                  )}
                </div>

                {showDraft && (ledger.nextAction.kind === "request_exhaustion_letter" || ledger.nextAction.kind === "request_payout_log") && (
                  <RequestDraft c={current} kind={ledger.nextAction.kind} />
                )}

                {(packet.note || packet.url) && (
                  <div className="mt-4 rounded border border-line bg-sheet p-3 text-sm">
                    {packet.note && <p className="text-ink-2">{packet.note}</p>}
                    {packet.url && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a href={packet.url} download={packet.name} className="rounded bg-plan px-3.5 py-2 text-sm font-medium text-sheet hover:bg-plan/85">
                          Download the packet (PDF)
                        </a>
                        <button type="button" onClick={markSent} className="rounded border border-ink/30 px-3.5 py-2 text-sm hover:border-ink">
                          Mark as sent to {current.secondary.payer}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                aria-label="Upload a carrier document"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void readDocument(f);
                }}
              />

              {reading.phase !== "idle" && (
                <section className="rounded-md border border-line bg-sheet p-5" aria-live="polite">
                  {reading.phase === "working" && (
                    <p className="text-sm">
                      <span className="font-medium">{reading.fileName}</span>
                      <span className="text-ink-2">: {reading.note}</span>
                    </p>
                  )}
                  {reading.phase === "error" && (
                    <div className="text-sm">
                      <p className="text-form-red">{reading.message}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ledger.exhausted && !ledger.letterOnFile && (
                          <button type="button" onClick={recordLetterByHand} className="rounded border border-ink/30 px-3 py-1.5 hover:border-ink">
                            Record the exhaustion letter by hand
                          </button>
                        )}
                        <button type="button" onClick={() => setReading({ phase: "idle" })} className="rounded border border-ink/30 px-3 py-1.5 hover:border-ink">
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                  {reading.phase === "review" && (
                    <ReviewCard reading={reading} onApprove={approve} onDiscard={() => setReading({ phase: "idle" })} />
                  )}
                </section>
              )}

              <section className="rounded-md border border-line bg-sheet">
                <div className="flex items-baseline justify-between px-5 pt-4 pb-3">
                  <h2 className="font-semibold">Visits</h2>
                  <span className="text-[12px] text-ink-2">
                    {ledger.lines.length} visits, <span className="fig">{formatUsd(ledger.billedCents)}</span> billed
                  </span>
                </div>
                <div className="flex flex-wrap px-5 pb-3 empty:hidden">
                  <AddVisit key={current.id} today={today} onAdd={addVisit} />
                </div>
                {ledger.lines.length === 0 && (
                  <p className="border-t border-line px-5 py-4 text-sm text-ink-2">
                    No visits yet. Add each visit as it is billed and the ledger counts it against the limit.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-y border-line text-left text-[12px] text-ink-2">
                        <th className="px-5 py-2 font-normal">Date</th>
                        <th className="px-2 py-2 text-right font-normal">Billed</th>
                        <th className="px-2 py-2 text-right font-normal">Carrier paid</th>
                        <th className="px-2 py-2 text-right font-normal">Balance</th>
                        <th className="px-2 py-2 font-normal">Status</th>
                        <th className="px-5 py-2 text-right font-normal">File by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.lines.map((l) => {
                        const open = l.status === "blocked_no_letter" || l.status === "ready_for_secondary";
                        return (
                          <tr key={l.visit.id} className="border-b border-line/70 last:border-0">
                            <td className="fig px-5 py-2">{l.visit.date}</td>
                            <td className="fig px-2 py-2 text-right">{formatUsd(l.visit.billedCents)}</td>
                            <td className="fig px-2 py-2 text-right text-ink-2">{formatUsd(l.primaryPaidCents)}</td>
                            <td className="fig px-2 py-2 text-right">{formatUsd(l.balanceCents)}</td>
                            <td className="px-2 py-2">
                              <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[12px] ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>
                            </td>
                            <td className={`fig px-5 py-2 text-right text-[12px] ${open && l.daysToDeadline <= 30 ? "font-medium text-form-red" : "text-ink-2"}`}>
                              {open ? `${l.filingDeadline} (${l.daysToDeadline}d)` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid gap-6 md:grid-cols-2">
                <section className="rounded-md border border-line bg-sheet p-5">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-semibold">Documents</h2>
                    <button type="button" onClick={() => fileInput.current?.click()} className="text-[13px] text-plan underline-offset-2 hover:underline">
                      Add a document
                    </button>
                  </div>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void readDocument(f);
                    }}
                    className={`mt-3 rounded border border-dashed px-3 py-4 text-center text-[13px] ${
                      dragging ? "border-plan bg-wash-plan text-plan" : "border-ink/30 text-ink-2"
                    }`}
                  >
                    Drop a carrier letter, EOB or payout log here (PDF, PNG or JPEG). You check what was read before anything
                    is filed.
                  </div>
                  {(unusedSamples.length > 0 || misfiled) && (
                    <div className="mt-4">
                      <p className="text-[12px] text-ink-2">Sample documents to try on this case</p>
                      <ul className="mt-1.5 space-y-2 text-sm">
                        {[...unusedSamples, ...(misfiled ? [misfiled] : [])].map((s) => (
                          <li key={s.file} className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span>
                              <span className="font-medium">{s.title}</span> <span className="text-ink-2">{s.shows}</span>
                            </span>
                            <span className="flex gap-3 text-[13px]">
                              <button type="button" onClick={() => trySample(s.file)} className="text-plan underline-offset-2 hover:underline">
                                Read it
                              </button>
                              <a href={`/samples/${s.file}`} download className="text-plan underline-offset-2 hover:underline">
                                Download
                              </a>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {current.documents.length === 0 ? (
                    <p className="mt-4 text-sm text-ink-2">Nothing filed on this case yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2.5 text-sm">
                      {current.documents.map((d) => (
                        <li key={d.id}>
                          <div className="text-[12px] text-ink-2">
                            {KIND_LABEL[d.kind]}, added <span className="fig">{d.addedOn}</span>
                          </div>
                          {d.sampleUrl ? (
                            <a href={d.sampleUrl} target="_blank" rel="noreferrer" className="text-plan underline-offset-2 hover:underline">
                              {d.name}
                            </a>
                          ) : (
                            <span>{d.name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-md border border-line bg-sheet p-5">
                  <h2 className="font-semibold">Activity</h2>
                  <ol className="mt-3 space-y-3 text-sm">
                    {[...current.timeline].reverse().map((t) => (
                      <li key={t.id}>
                        <div className="text-[12px] text-ink-2">
                          <span className="fig">{t.date}</span>, {t.by === "agent" ? "case agent" : t.by === "staff" ? "billing staff" : "health plan"}
                        </div>
                        {t.text}
                      </li>
                    ))}
                  </ol>
                </section>
              </div>

              <Glossary />
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

function ReviewCard({
  reading,
  onApprove,
  onDiscard,
}: {
  reading: Extract<Reading, { phase: "review" }>;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const ex = reading.extraction;
  const facts: Array<[string, string | undefined]> = [
    ["Type", KIND_LABEL[ex.document_kind]],
    ["Carrier", ex.carrier],
    ["Claim", ex.claim_number],
    ["Limit", ex.policy_limit_cents !== undefined ? formatUsd(ex.policy_limit_cents) : undefined],
    ["Total paid", ex.total_paid_cents !== undefined ? formatUsd(ex.total_paid_cents) : undefined],
    ["Remaining", ex.remaining_cents !== undefined ? formatUsd(ex.remaining_cents) : undefined],
    ["Exhausted on", ex.exhaustion_date],
    ["Payments listed", ex.payments?.length ? String(ex.payments.length) : undefined],
  ];
  const { blocked, changes } = reading.proposal;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Check what was read from {reading.fileName}</h2>
        <span className="text-[12px] text-ink-2">
          {reading.sample ? "Sample reading, agent not connected" : `Agent confidence: ${ex.confidence}`}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] text-ink-2">{k}</dt>
              <dd className="fig">{v}</dd>
            </div>
          ))}
      </dl>
      {ex.notes && <p className="mt-3 text-sm text-ink-2">Agent note: {ex.notes}</p>}
      {blocked ? (
        <p className="mt-4 rounded border border-form-red/40 bg-wash-red p-3 text-sm text-form-red">{blocked}</p>
      ) : (
        <div className="mt-4">
          <p className="text-[12px] text-ink-2">Approving will:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {changes.length ? changes.map((c) => <li key={c}>{c}</li>) : <li>File the document. It adds nothing new to the ledger.</li>}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!blocked && (
          <button type="button" onClick={onApprove} className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85">
            Approve and file
          </button>
        )}
        <button type="button" onClick={onDiscard} className="rounded border border-ink/30 px-3.5 py-2 text-sm hover:border-ink">
          Discard
        </button>
      </div>
    </div>
  );
}

function RequestDraft({ c, kind }: { c: AccidentCase; kind: "request_exhaustion_letter" | "request_payout_log" }) {
  const [copied, setCopied] = useState(false);
  const coverage = c.primary.coverage === "WorkersComp" ? "workers' compensation" : c.primary.coverage;
  const ask =
    kind === "request_exhaustion_letter"
      ? `Our records show the ${coverage} benefit on this claim has been paid in full. Please send a benefits exhaustion letter stating the policy limit, the total paid and the date of exhaustion, so we can bill the patient's health plan.`
      : `Please send the current ${coverage} payout log for this claim, listing each payment, payee and date, with the remaining benefit. We are close to the limit and need to confirm the balance before billing further visits.`;
  const text = `To: ${c.primary.adjuster.name}, ${c.primary.carrier} <${c.primary.adjuster.email}>\nRe: ${c.patient.name}, claim ${c.primary.claimNumber}\n\n${ask}\n\nThank you,\nBilling office, ${c.clinic}`;
  return (
    <div className="mt-4 rounded border border-line bg-sheet p-3">
      <pre className="font-sans text-sm whitespace-pre-wrap">{text}</pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="mt-3 rounded border border-ink/30 px-3 py-1.5 text-sm hover:border-ink"
      >
        {copied ? "Copied" : "Copy request"}
      </button>
    </div>
  );
}
