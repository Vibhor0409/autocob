import Link from "next/link";
import { BenefitBar } from "@/components/BenefitBar";
import { computeLedger, formatUsd } from "@/lib/ledger.ts";
import { DEMO_TODAY, SAMPLE_CASES } from "@/lib/sample-cases.ts";

export default function Home() {
  const stuck = SAMPLE_CASES[0];
  const ledger = computeLedger(stuck, DEMO_TODAY);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-16">
      <p className="text-[17px] font-bold tracking-tight">
        Auto<span className="text-form-red">COB</span>
      </p>

      <h1 className="mt-10 max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight sm:text-6xl">
        The auto policy ran out on visit 14. The health plan still doesn&apos;t know.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-ink-2">
        After a car accident, auto insurance pays the clinic first, up to a limit. The health plan pays only after that limit is
        used up, and only with the carrier&apos;s letter proving it. AutoCOB keeps count, chases the letter, and builds the
        packet.
      </p>

      <section className="mt-12 rounded-md border border-line bg-sheet p-5 sm:p-7" aria-label="Example case">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">
            {stuck.patient.name}, {stuck.primary.carrier}
          </p>
          <p className="text-[12px] text-ink-2">Sample case, fictional data</p>
        </div>
        <div className="mt-5">
          <BenefitBar ledger={ledger} coverage={stuck.primary.coverage} />
        </div>
        <p className="mt-5 max-w-2xl text-sm">
          Four visits sit past the line. <span className="fig font-medium text-form-red">{formatUsd(ledger.blockedCents)}</span>{" "}
          cannot be billed to the health plan until {stuck.primary.carrier} confirms in writing that the benefit is gone.
        </p>
        <Link
          href="/workspace"
          className="mt-6 inline-block rounded bg-ink px-5 py-3 text-sm font-medium text-sheet hover:bg-ink/85"
        >
          Open the demo workspace
        </Link>
      </section>

      <section className="mt-14 grid gap-8 sm:grid-cols-3">
        <div>
          <h2 className="font-semibold">Counts every dollar against the limit</h2>
          <p className="mt-2 text-sm text-ink-2">
            The emergency room and imaging center draw on the same benefit. The ledger includes their payments, so the clinic
            sees the real balance and the visit it will run out on.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Reads what the carrier sends</h2>
          <p className="mt-2 text-sm text-ink-2">
            Upload an EOB, payout log or exhaustion letter. A case agent extracts the figures, checks them against the claim, and
            shows staff exactly what will change before anything is filed.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Builds the secondary packet</h2>
          <p className="mt-2 text-sm text-ink-2">
            One PDF: cover letter, visit ledger, the exhaustion letter and the carrier&apos;s payment record, ready to send before
            the filing deadline.
          </p>
        </div>
      </section>

      <footer className="mt-16 border-t border-line pt-5 text-[12px] text-ink-2">
        Built for The Big Hack Game. The case agent runs on HarnessRouter. Money math is done in code, never by a model. This
        demo uses fictional data and is not for real patient records.
      </footer>
    </main>
  );
}
