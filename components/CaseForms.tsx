"use client";

import { useRef, useState } from "react";
import type { Ledger } from "@/lib/ledger.ts";
import type { AccidentCase, CoverageType } from "@/lib/types";

const field = "mt-1 w-full rounded border border-line bg-sheet px-2.5 py-1.5 text-sm";
const dollarsToCents = (v: string): number | null => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) : null;
};
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

/** Create a case, or edit the details of an existing one. */
export function CaseDialog({
  clinic,
  today,
  existing,
  label,
  labelClass,
  onSave,
}: {
  clinic: string;
  today: string;
  existing?: AccidentCase;
  label: string;
  labelClass: string;
  onSave: (c: AccidentCase) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const e = existing;
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={labelClass}>
        {label}
      </button>
      <dialog ref={dialog} className="m-auto max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-line bg-sheet p-0 text-ink backdrop:bg-ink/40">
        <form
          className="p-6"
          onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            const get = (k: string) => String(f.get(k) ?? "").trim();
            const limit = dollarsToCents(get("limit"));
            const days = Number(get("days"));
            if (!get("patient") || !get("carrier") || !get("claim") || !get("payer")) {
              return setError("Fill in the patient reference, carrier, claim number and health plan.");
            }
            if (limit === null) return setError("Enter the policy limit in dollars, for example 10000.");
            if (!Number.isInteger(days) || days < 30 || days > 730) return setError("Filing window must be between 30 and 730 days.");
            const base: AccidentCase = e
              ? structuredClone(e)
              : {
                  id: newId("case"),
                  patient: { name: "", dob: "" },
                  clinic,
                  injuryDate: today,
                  accident: "Auto accident",
                  primary: { carrier: "", coverage: "PIP", claimNumber: "", limitCents: 0, adjuster: { name: "", phone: "", email: "" }, claimVerified: false },
                  secondary: { payer: "", memberId: "", timelyFilingDays: 180 },
                  visits: [],
                  payments: [],
                  documents: [],
                  timeline: [{ id: newId("t"), date: today, by: "staff", text: "Case opened." }],
                };
            base.patient.name = get("patient");
            base.injuryDate = get("injury") || base.injuryDate;
            base.accident = get("accident") as AccidentCase["accident"];
            base.primary.carrier = get("carrier");
            base.primary.coverage = get("coverage") as CoverageType;
            base.primary.claimNumber = get("claim");
            base.primary.limitCents = limit;
            base.primary.adjuster = { name: get("adjName"), phone: get("adjPhone"), email: get("adjEmail") };
            base.secondary = { payer: get("payer"), memberId: get("member"), timelyFilingDays: days };
            if (e) base.timeline.push({ id: newId("t"), date: today, by: "staff", text: "Case details edited." });
            onSave(base);
            setError("");
            if (!e) ev.currentTarget.reset();
            dialog.current?.close();
          }}
        >
          <h2 className="text-lg font-semibold">{e ? "Edit case details" : "New accident case"}</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Use a case reference or initials, not the patient&apos;s full name, until your organisation has a signed data agreement.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] text-ink-2">
              Patient reference
              <input name="patient" required defaultValue={e?.patient.name} placeholder="M.A. or chart 10482" className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Date of accident
              <input name="injury" type="date" max={today} defaultValue={e?.injuryDate ?? today} className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Type of accident
              <select name="accident" className={field} defaultValue={e?.accident ?? "Auto accident"}>
                <option>Auto accident</option>
                <option>Workplace injury</option>
                <option>Slip and fall</option>
              </select>
            </label>
            <label className="text-[12px] text-ink-2">
              Coverage that pays first
              <select name="coverage" className={field} defaultValue={e?.primary.coverage ?? "PIP"}>
                <option value="PIP">PIP</option>
                <option value="MedPay">MedPay</option>
                <option value="WorkersComp">Workers&apos; comp</option>
              </select>
            </label>
            <label className="text-[12px] text-ink-2">
              Auto or workers&apos; comp carrier
              <input name="carrier" required defaultValue={e?.primary.carrier} className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Claim number
              <input name="claim" required defaultValue={e?.primary.claimNumber} className={`${field} fig`} />
            </label>
            <label className="text-[12px] text-ink-2">
              Policy limit ($)
              <input name="limit" inputMode="decimal" required placeholder="10000" defaultValue={e ? (e.primary.limitCents / 100).toFixed(2) : ""} className={`${field} fig`} />
            </label>
            <label className="text-[12px] text-ink-2">
              Adjuster name
              <input name="adjName" defaultValue={e?.primary.adjuster.name} className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Adjuster phone
              <input name="adjPhone" type="tel" defaultValue={e?.primary.adjuster.phone} className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Adjuster email
              <input name="adjEmail" type="email" defaultValue={e?.primary.adjuster.email} className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Health plan
              <input name="payer" required defaultValue={e?.secondary.payer} className={field} />
            </label>
            <label className="text-[12px] text-ink-2">
              Member ID
              <input name="member" defaultValue={e?.secondary.memberId} className={`${field} fig`} />
            </label>
            <label className="text-[12px] text-ink-2">
              Health plan filing window (days)
              <input name="days" inputMode="numeric" required defaultValue={e?.secondary.timelyFilingDays ?? 180} className={`${field} fig`} />
            </label>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-[13px] text-form-red">
              {error}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button type="submit" className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85">
              {e ? "Save details" : "Open case"}
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

/** Record a carrier payment by hand, for when there is no document to read. */
export function RecordPayment({
  ledger,
  today,
  onAdd,
}: {
  ledger: Ledger;
  today: string;
  onAdd: (p: { date: string; cents: number; visitId?: string; payee?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const unpaid = ledger.lines.filter((l) => l.primaryPaidCents === 0);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] text-plan underline-offset-2 hover:underline">
        Record a carrier payment
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap items-end gap-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const date = String(f.get("date") ?? "");
        const cents = dollarsToCents(String(f.get("amount") ?? ""));
        const to = String(f.get("to") ?? "");
        const payee = String(f.get("payee") ?? "").trim().slice(0, 100);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Choose the date the carrier paid.");
        if (cents === null) return setError("Enter the amount paid, for example 315.00.");
        if (to === "other" && !payee) return setError("Enter which provider was paid.");
        onAdd(to === "other" ? { date, cents, payee } : { date, cents, visitId: to });
        setError("");
        setOpen(false);
      }}
    >
      <label className="text-[12px] text-ink-2">
        Date paid
        <input name="date" type="date" defaultValue={today} max={today} required className={field} />
      </label>
      <label className="text-[12px] text-ink-2">
        Amount ($)
        <input name="amount" inputMode="decimal" placeholder="315.00" required className={`${field} fig w-28`} />
      </label>
      <label className="text-[12px] text-ink-2">
        Paid for
        <select name="to" className={field} defaultValue={unpaid[0]?.visit.id ?? "other"}>
          {unpaid.map((l) => (
            <option key={l.visit.id} value={l.visit.id}>
              Our visit on {l.visit.date}
            </option>
          ))}
          <option value="other">Another provider</option>
        </select>
      </label>
      <label className="min-w-40 flex-1 text-[12px] text-ink-2">
        Other provider (if chosen)
        <input name="payee" placeholder="Emergency department" className={field} />
      </label>
      <button type="submit" className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-sheet hover:bg-ink/85">
        Record payment
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
