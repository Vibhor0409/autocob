"use client";

import { useState } from "react";
import type { Ledger } from "@/lib/ledger.ts";
import type { AccidentCase } from "@/lib/types";

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
            className={`border-t-[3px] pt-2 ${isDone ? "border-paid" : isNow ? "border-brand" : "border-line"}`}
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
    <details className="card px-5 py-3 text-sm">
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
      <button type="button" onClick={() => setOpen(true)} className="link-action">
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
      <button type="submit" className="btn-primary px-3.5 py-2 text-sm font-medium">
        Add visit
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-3.5 py-2 text-sm">
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
