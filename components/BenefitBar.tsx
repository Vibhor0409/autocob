import { formatUsd, type Ledger } from "@/lib/ledger.ts";

// The benefit strip. The carrier's limit is a hard line; whatever the clinic has billed past it
// spills over the line, in claim-form red until the exhaustion letter releases it.
export function BenefitBar({ ledger, coverage, compact = false }: { ledger: Ledger; coverage: string; compact?: boolean }) {
  const l = ledger;
  const pendingInside = Math.min(l.waitingOnPrimaryCents, l.remainingCents);
  const pendingOver = l.waitingOnPrimaryCents - pendingInside;
  const free = l.remainingCents - pendingInside;
  const ready = l.secondaryBalanceCents - l.blockedCents;
  const over = l.blockedCents + ready + pendingOver;
  const scale = l.limitCents + over || 1;
  const pct = (c: number) => `${(c / scale) * 100}%`;

  const inside = [
    { key: "others", cents: l.paidToOthersCents, cls: "hatch-ink", label: "Paid to other providers" },
    { key: "clinic", cents: l.paidToClinicCents, cls: "bg-paid", label: "Paid to this clinic" },
    { key: "pending", cents: pendingInside, cls: "hatch-wait", label: "Billed, waiting on carrier" },
    { key: "free", cents: free, cls: "bg-sheet", label: "Still available" },
  ];
  const outside = [
    { key: "blocked", cents: l.blockedCents, cls: "hatch-red", label: "Stuck: needs exhaustion letter" },
    { key: "ready", cents: ready, cls: "bg-plan", label: "Ready for the health plan" },
    { key: "pover", cents: pendingOver, cls: "hatch-wait", label: "Billed past the limit" },
  ];
  const summary = `${coverage} limit ${formatUsd(l.limitCents)}. ${formatUsd(l.paidTotalCents)} paid, ${formatUsd(l.remainingCents)} remaining${
    over ? `, ${formatUsd(over)} billed past the limit` : ""
  }.`;

  return (
    <div>
      <div role="img" aria-label={summary} className={`relative ${compact ? "h-2.5" : "h-9"}`}>
        <div className="absolute inset-0 flex overflow-hidden rounded-md border border-ink/60 bg-sheet">
          {[...inside, ...outside].map((s) =>
            s.cents > 0 ? (
              <div
                key={s.key}
                className={`h-full ${s.cls} ${s.key === "free" ? "" : "border-r border-sheet/80"}`}
                style={{ width: pct(s.cents) }}
              />
            ) : null,
          )}
        </div>
        {/* the limit line */}
        <div
          className="absolute -top-1.5 -bottom-1.5 w-[2px] bg-ink"
          style={{ left: `calc(${pct(l.limitCents)} - 1px)` }}
          aria-hidden
        />
      </div>
      {!compact && (
        <>
          <div className="relative mt-1 h-5 text-[11px] text-ink-2" aria-hidden>
            <span
              className="fig absolute -translate-x-full pr-1.5 whitespace-nowrap"
              style={{ left: pct(l.limitCents) }}
            >
              {coverage} limit {formatUsd(l.limitCents)}
            </span>
            {over > 0 && (
              <span className="fig absolute right-0 font-medium whitespace-nowrap text-form-red">
                {formatUsd(over)} past
              </span>
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-ink-2">
            {[...inside, ...outside]
              .filter((s) => s.cents > 0)
              .map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className={`inline-block h-2.5 w-2.5 rounded-[2px] border border-ink/50 ${s.cls}`} aria-hidden />
                  {s.label}
                  <span className="fig text-ink">{formatUsd(s.cents)}</span>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
