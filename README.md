# AutoCOB

Accident billing for outpatient clinics. After a car accident or workplace injury, the auto or workers' comp carrier pays the clinic first, up to a limit. The health plan pays only after that limit is used up, and only with the carrier's letter proving it. AutoCOB keeps the running balance, reads what the carrier sends, and builds the packet the health plan needs.

Built for The Big Hack Game (Stanford vs Berkeley). The case agent runs on HarnessRouter.

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
