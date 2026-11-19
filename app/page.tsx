import Link from "next/link";
import { BenefitBar } from "@/components/BenefitBar";
import { computeLedger, formatUsd } from "@/lib/ledger.ts";
import { DEMO_TODAY, SAMPLE_CASES } from "@/lib/sample-cases.ts";
import { Logo } from "@/components/Logo";

const STEPS = [
  {
    title: "Open the case",
    body: "Enter the auto or workers' comp carrier, the claim number, the policy limit and the patient's health plan. It takes about a minute.",
  },
  {
    title: "Feed it what the carrier sends",
    body: "Drop in EOBs, payout logs and letters. The case agent reads each one, checks it against the claim, and lists exactly what it would change. Nothing is filed until you approve it.",
  },
  {
    title: "Watch the limit, not a spreadsheet",
    body: "The ledger counts every payment against the limit, including the emergency room and imaging center you never see. You know the visit the benefit runs out on before it happens.",
  },
  {
    title: "Send the health plan one packet",
    body: "When the exhaustion letter is on file, AutoCOB builds the cover letter, visit ledger and enclosures into one PDF, ordered by the nearest filing deadline.",
  },
];

export default function Home() {
  const stuck = SAMPLE_CASES[0];
  const ledger = computeLedger(stuck, DEMO_TODAY);

  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center gap-4 px-5 py-5 sm:px-8">
        <p className="text-[17px] font-bold tracking-tight">
          <Logo />
        </p>
        <nav className="ml-auto flex items-center gap-2 text-sm" aria-label="Account">
          <Link href="/demo" className="hidden px-2 py-1.5 text-ink-2 hover:text-ink sm:inline">
            Demo
          </Link>
          <Link href="/login" className="px-2 py-1.5 text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary px-3.5 py-2 font-medium">
            Create a workspace
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16 sm:px-8">
        <h1 className="mt-8 max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight sm:mt-12 sm:text-6xl">
          The auto policy ran out on visit 14. The health plan still doesn&apos;t know.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-2">
          AutoCOB is the worklist for accident billing. It tracks each patient&apos;s auto or workers&apos; comp benefit, reads the
          carrier&apos;s paperwork, and builds the packet the health plan needs once the limit is gone, before the filing
          deadline passes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="btn-primary px-5 py-3 text-sm font-medium">
            Create a workspace
          </Link>
          <Link href="/demo" className="btn-secondary px-5 py-3 text-sm">
            Try the demo, no sign-up
          </Link>
        </div>

        <section className="mt-12 card p-5 sm:p-7" aria-label="Example case">
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
            Other providers used more than half of this patient&apos;s limit. Four of the clinic&apos;s visits now sit past the
            line: <span className="fig font-medium text-form-red">{formatUsd(ledger.blockedCents)}</span> that cannot go to the
            health plan until the carrier confirms in writing that the benefit is exhausted.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight">Built for the people who work these claims</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="card p-5">
              <h3 className="font-semibold">Accident billing companies</h3>
              <p className="mt-2 text-sm text-ink-2">
                You work PIP, MedPay and workers&apos; comp claims for several clinics. One worklist shows every case that needs a
                payout log, a letter or a packet today, with the money at stake beside it.
              </p>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold">Multi-location clinic groups</h3>
              <p className="mt-2 text-sm text-ink-2">
                Physical therapy, orthopedic and chiropractic groups with a central billing office. Your accident specialist
                stops keeping one spreadsheet per patient, and anyone on the team can pick a case up.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight">How a case moves</h2>
          <ol className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-[3px] border-ink pt-3">
                <h3 className="font-semibold">
                  <span className="fig mr-2 text-ink-2">{i + 1}</span>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 grid gap-8 sm:grid-cols-3">
          <div>
            <h2 className="font-semibold">Staff approve every change</h2>
            <p className="mt-2 text-sm text-ink-2">
              The agent proposes; a person files. A letter for the wrong claim or the wrong carrier is refused before it can touch
              a case.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Money math is done in code</h2>
            <p className="mt-2 text-sm text-ink-2">
              Balances, limits and deadlines are calculated the same way every time, in whole cents. A model never adds up your
              ledger.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">Your workspace is yours</h2>
            <p className="mt-2 text-sm text-ink-2">
              Each clinic group or billing company has its own workspace. Cases and stored documents are visible only to the
              people you invite.
            </p>
          </div>
        </section>

        <section className="mt-16 card p-5 sm:p-7">
          <h2 className="text-xl font-bold tracking-tight">Early access: what to know before you start</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-2">
            <li>
              Use de-identified or test data for now: case references instead of names, and no real patient documents. Real
              patient records need a signed data agreement, which we set up with each organisation.
            </li>
            <li>AutoCOB reads documents and drafts letters. It does not phone adjusters or log in to carrier portals.</li>
            <li>It works beside your billing system. There is no claims-system integration yet; the worklist exports to CSV.</li>
          </ul>
          <Link href="/signup" className="mt-6 inline-block btn-primary px-5 py-3 text-sm font-medium">
            Create a workspace
          </Link>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl border-t border-line px-5 py-5 text-[12px] text-ink-2 sm:px-8">
        AutoCOB. The case agent runs on HarnessRouter. Sample cases shown on this site are fictional.
      </footer>
    </>
  );
}
