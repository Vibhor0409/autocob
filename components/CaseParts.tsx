"use client";

import { useRef, useState } from "react";
import type { Ledger } from "@/lib/ledger.ts";
import type { AccidentCase, CoverageType } from "@/lib/types";

/** Where a case stands. These four stages always happen in this order, so they are numbered. */
export function CaseSteps({ c, ledger }: { c: AccidentCase; ledger: Ledger }) {
  const open = ledger.lines.some((l) => l.status === "ready_for_secondary" || l.status === "blocked_no_letter");
  const sent = ledger.lines.some((l) => l.status === "sent_to_secondary");
  const done = [
    c.primary.claimVerified,
    ledger.exhausted,
    ledger.letterOnFile,
    ledger.letterOnFile && sent && !open,
  ];
  const steps = [
    { title: "Claim confirmed", hint: `${c.primary.carrier} accepts the claim` },
    { title: "Limit reached", hint: `${c.primary.coverage} benefit is used up` },
    { title: "Letter on file", hint: "Carrier confirms it in writing" },
    { title: "Sent to health plan", hint: `${c.secondary.payer} takes over` },
  ];
  const current = done.findIndex((d) => !d);
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4" aria-label="Where this case stands">
      {steps.map((s, i) => {
        const isDone = done[i];
        const isNow = i === current;
        return (
          <li
            key={s.title}
            aria-current={isNow ? "step" : undefined}
            className={`border-t-[3px] pt-2 ${isDone ? "border-paid" : isNow ? "border-ink" : "border-line"}`}
          >
            <div className={`text-[13px] font-semibold ${isDone || isNow ? "" : "text-ink-2"}`}>
              <span className="fig mr-1.5 text-ink-2">{i + 1}</span>
              {s.title}
              {isDone && <span className="ml-1.5 text-[12px] font-normal text-paid">done</span>}
              {isNow && <span className="ml-1.5 text-[12px] font-normal text-ink-2">now</span>}
            </div>
            <div className="mt-0.5 text-[12px] text-ink-2">{s.hint}</div>
          </li>
        );
      })}
    </ol>
  );
}

const TERMS: Array<[string, string]> = [
  ["PIP and MedPay", "Auto insurance coverage that pays medical bills after a crash, up to a fixed limit, before health insurance pays anything."],
  ["Limit", "The most the auto policy will pay for this accident. Every provider the patient sees draws on the same limit."],
  ["Payout log", "The carrier's list of every payment made on the claim, to every provider. It is the only way to see the true balance."],
  ["Exhaustion letter", "The carrier's written statement that the limit has been paid out. Health plans require it before they pay."],
  ["CARC 22", "The denial a health plan sends when it believes another insurer should pay first."],
  ["File-by date", "The last day the health plan accepts a claim for that visit. After it, the money is written off."],
];

export function Glossary() {
  return (
    <details className="rounded-md border border-line bg-sheet px-5 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">What the terms mean</summary>
      <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {TERMS.map(([term, meaning]) => (
          <div key={term}>
            <dt className="font-medium">{term}</dt>
            <dd className="text-ink-2">{meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const field = "mt-1 w-full rounded border border-line bg-sheet px-2.5 py-1.5 text-sm";
const dollarsToCents = (v: string): number | null => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) : null;
};

export function AddVisit({ today, onAdd }: { today: string; onAdd: (date: string, cents: number, service: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] text-plan underline-offset-2 hover:underline">
        Add a visit
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap items-end gap-3 border-t border-line px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const date = String(f.get("date") ?? "");
        const cents = dollarsToCents(String(f.get("amount") ?? ""));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Choose the date of the visit.");
        if (cents === null) return setError("Enter the amount billed, for example 315.00.");
        onAdd(date, cents, String(f.get("service") ?? "").trim().slice(0, 80) || "Office visit");
        setError("");
        setOpen(false);
      }}
    >
      <label className="text-[12px] text-ink-2">
        Date of visit
        <input name="date" type="date" defaultValue={today} max={today} required className={field} />
      </label>
      <label className="text-[12px] text-ink-2">
        Amount billed ($)
        <input name="amount" inputMode="decimal" placeholder="315.00" required className={`${field} fig w-28`} />
      </label>
      <label className="min-w-40 flex-1 text-[12px] text-ink-2">
        Service
        <input name="service" placeholder="Therapeutic exercise" className={field} />
      </label>
      <button type="submit" className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85">
        Add visit
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded border border-ink/30 px-3.5 py-2 text-sm hover:border-ink">
        Cancel
      </button>
      {error && (
        <p role="alert" className="w-full text-[13px] text-form-red">
          {error}
        </p>
      )}
    </form>
  );
}

export function NewCase({ clinic, today, onCreate }: { clinic: string; today: string; onCreate: (c: AccidentCase) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded border border-line px-2.5 py-1 text-[12px] hover:border-ink"
      >
        New case
      </button>
      <dialog ref={dialog} className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-md border border-line bg-sheet p-0 text-ink backdrop:bg-ink/40">
        <form
          className="p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const get = (k: string) => String(f.get(k) ?? "").trim();
            const limit = dollarsToCents(get("limit"));
            const days = Number(get("days"));
            if (!get("patient") || !get("carrier") || !get("claim") || !get("payer")) return setError("Fill in the patient, carrier, claim number and health plan.");
            if (limit === null) return setError("Enter the policy limit in dollars, for example 10000.");
            if (!Number.isInteger(days) || days < 30 || days > 730) return setError("Filing window must be between 30 and 730 days.");
            onCreate({
              id: `case-${Date.now()}`,
              patient: { name: get("patient"), dob: "" },
              clinic,
              injuryDate: get("injury") || today,
              accident: "Auto accident",
              primary: {
                carrier: get("carrier"),
                coverage: get("coverage") as CoverageType,
                claimNumber: get("claim"),
                limitCents: limit,
                adjuster: { name: "Not assigned yet", phone: "", email: "" },
                claimVerified: false,
              },
              secondary: { payer: get("payer"), memberId: get("member"), timelyFilingDays: days },
              visits: [],
              payments: [],
              documents: [],
              timeline: [{ id: `t-${Date.now()}`, date: today, by: "staff", text: "Case opened." }],
            });
            setError("");
            e.currentTarget.reset();
            dialog.current?.close();
          }}
        >
          <h2 className="text-lg font-semibold">New accident case</h2>
          <p className="mt-1 text-[13px] text-ink-2">Demo workspace: use made-up details, not a real patient.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] text-ink-2">
              Patient name
              <input name="patient" required className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Date of accident
              <input name="injury" type="date" max={today} defaultValue={today} className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Auto or workers&apos; comp carrier
              <input name="carrier" required className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Coverage
              <select name="coverage" className={field} defaultValue="PIP">
                <option value="PIP">PIP</option>
                <option value="MedPay">MedPay</option>
                <option value="WorkersComp">Workers&apos; comp</option>
              </select>
            </label>
            <label className="text-[12px] text-ink-2">
              Claim number
              <input name="claim" required className={`${field} fig`} />
            </label>
            <label className="text-[12px] text-ink-2">
              Policy limit ($)
              <input name="limit" inputMode="decimal" placeholder="10000" required className={`${field} fig`} />
            </label>
            <label className="text-[12px] text-ink-2">
              Health plan
              <input name="payer" required className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Member ID
              <input name="member" className={`${field} fig`} />
            </label>
            <label className="text-[12px] text-ink-2">
              Health plan filing window (days)
              <input name="days" inputMode="numeric" defaultValue="180" required className={`${field} fig`} />
            </label>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-[13px] text-form-red">
              {error}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button type="submit" className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85">
              Open case
            </button>
            <button type="button" onClick={() => dialog.current?.close()} className="rounded border border-ink/30 px-3.5 py-2 text-sm hover:border-ink">
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
