# AutoCOB

Accident billing for outpatient clinics. After a car accident or workplace injury, the auto or workers' comp carrier pays the clinic first, up to a limit. The health plan pays only after that limit is used up, and only with the carrier's letter proving it. AutoCOB keeps the running balance, reads what the carrier sends, and builds the packet the health plan needs.

Built for The Big Hack Game (Stanford vs Berkeley). The case agent runs on HarnessRouter.

## Berkeley Startup Sprint (Nov 20, 2026): AutoCOB for Students

**Team Vikings** · Vibhor Agrawal (solo) · Challenge area: student and community needs.
**Live:** https://autocob.vercel.app/students (no login needed).

**User and problem.** A college student hurt in a car accident gets bills from the ambulance, the ER and physical therapy, and nobody tells them who should pay. Car insurance, their student health plan (for example UC SHIP), a parent's plan and the other driver's insurer each pay in a set order that depends on the state. Get the order wrong and the bill lands on the student or goes to collections.

**What it does.**
1. Six questions: state, your role in the crash, household car insurance, MedPay, fault, and health coverage.
2. It shows who pays, in order, with what each payer covers and what you should do (for example, ask for the PIP exhaustion letter).
3. A checklist of documents to gather.
4. A ready-to-copy message for the billing office that asks them to bill in the right order and hold the account.
5. "Ask AutoCOB": plain-language answers through **Vercel AI Gateway**, called only from the server and grounded in the student's plan.
6. "Hear my plan": reads the plan aloud with **ElevenLabs** text-to-speech, from the server. It falls back to the browser's voice if no key is set.

**Built today:** `app/students/` (rules engine and UI), `app/api/students/explain` (AI Gateway) and `app/api/students/speak` (ElevenLabs).
**Pre-existing work:** the AutoCOB biller product (clinic workspace, HarnessRouter case agent, packet builder), built earlier this week for The Big Hack Game. Tools: Next.js on Vercel and Claude Code for coding help.

**Research finding.** Cold emails to 21+ accident billing firms this week showed the gap: many billing firms don't handle car accident claims at all, and the ones that do chase "exhaustion letters" by hand. If professional billers struggle with this step, a student with no help stands even less chance.
**Technical tradeoff.** The payer order is a deterministic rules engine, not an LLM. Dollar limits and payer order must never be made up, so the AI only explains the plan the rules produced. That gives up flexibility for states outside NY, NJ, FL, MI and CA (shown as general guidance) in exchange for answers that can be checked.
**ElevenLabs award:** entering, with "Hear my plan" text-to-speech for students who would rather listen than read a wall of insurance terms.

**Run locally:** `npm install && npm run dev`, then open `/students`. Optional server secrets: `AI_GATEWAY_API_KEY` and `ELEVENLABS_API_KEY`.

**Limits.** General information, not legal advice. State rules cover NY, NJ, FL, MI and CA; other states get general guidance. Nothing is stored.

## Who it is for

The billing specialist at a physical therapy, chiropractic, orthopedic or urgent care clinic, or at a billing agency working for those clinics. They handle the accident cases by hand today, with a spreadsheet per patient and phone calls to adjusters.

## What is in the product

- **Accounts and workspaces.** Email and password sign-in, one workspace per clinic group or billing company, invite links for teammates. Every case and stored file is scoped to its workspace.
- **Worklist.** Search, filters, money stuck and ready to send, filing deadlines within 30 days, CSV export.
- **Cases.** Visits, carrier payments, the benefit ledger, guided next step, edit and delete.
- **Case agent.** Reads carrier documents and drafts cover letters on HarnessRouter. Signed-in staff only, with a daily allowance per workspace. Staff approve every change.
- **Packet.** Cover letter, visit ledger and enclosures as one PDF.
- **Public demo** at `/demo`: fictional cases in the browser, stored sample readings, no sign-in and no agent spend.

## Run it

```bash
npm install
npm run migrate   # creates the tables; needs DATABASE_URL (Postgres) in the environment or .env.local
npm run dev
```

## Connect the case agent

```bash
npm run connect
```

This opens a hidden prompt for a HarnessRouter API key, saves it to `.env.harnessrouter` (ignored by git), creates or reuses the "AutoCOB case agent" Harness from `harness-instructions.txt`, and writes `harnessrouter.json`. `node scripts/connect.ts --update` pushes edited instructions to the live Harness. On Vercel, set `HR_API_KEY`, `HR_HARNESS_ID` and `DATABASE_URL`.

## How it is put together

- `lib/ledger.ts`: the benefit ledger. Pure functions, integer cents. Money math is never done by a model.
- `lib/apply.ts`: turns the agent's reading into proposed changes that staff approve. Refuses documents for another claim or carrier.
- `lib/validate.ts`: rebuilds every case the server is asked to save, keeping only known fields.
- `lib/packet.ts`: builds the secondary packet PDF in the browser.
- `lib/server/auth.ts`: scrypt password hashes, hashed session tokens in an HttpOnly cookie, same-origin checks on every write.
- `lib/server/agent.ts`: the bridge to HarnessRouter. The key, Harness ID and upstream ids stay on the server.
- `db/schema.sql`: the tables. `public/samples/`: fictional carrier documents (`node scripts/make-samples.mjs`).

## Tests

```bash
npm test                                   # ledger, document rules, packet
npm run smoke -- http://localhost:3000     # accounts, isolation, saving, files, invites
npm run smoke -- http://localhost:3000 --agent   # adds one live agent read
```

## Limits of this version

- **De-identified or test data only.** Real patient records need signed data agreements with every service that touches them (hosting, database, HarnessRouter and its model provider). Those are not in place.
- No password reset by email, no email verification, no two-factor sign-in yet.
- The agent reads documents and drafts letters. It does not call adjusters or log in to carrier portals.
- No integration with practice-management or clearinghouse systems; the worklist exports to CSV.
- One database serves local development and production.
