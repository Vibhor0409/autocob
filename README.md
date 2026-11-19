# AutoCOB

Accident billing for outpatient clinics. After a car accident or workplace injury, the auto or workers' comp carrier pays the clinic first, up to a limit. The health plan pays only after that limit is used up, and only with the carrier's letter proving it. AutoCOB keeps the running balance, reads what the carrier sends, and builds the packet the health plan needs.

Built for The Big Hack Game (Stanford vs Berkeley). The case agent runs on HarnessRouter.

## Who it is for

The billing specialist at a physical therapy, chiropractic, orthopedic or urgent care clinic, or at a billing agency working for those clinics. They handle the accident cases by hand today, with a spreadsheet per patient and phone calls to adjusters.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The workspace opens with four fictional cases and works without any key, using stored readings of the bundled sample documents.

## Connect the case agent

```bash
npm run connect
```

This opens a hidden prompt for a HarnessRouter API key, saves it to `.env.harnessrouter` (ignored by git), creates or reuses the "AutoCOB case agent" Harness from `harness-instructions.txt`, and writes `harnessrouter.json` with the Harness ID. Restart the dev server afterwards. On a host such as Vercel, set `HR_API_KEY` and `HR_HARNESS_ID` as environment variables instead.

## How it is put together

- `lib/ledger.ts`: the benefit ledger. Pure functions, integer cents. Money math is never done by a model.
- `lib/apply.ts`: turns the agent's reading of a document into proposed changes that staff approve. Refuses documents for another claim or carrier.
- `lib/packet.ts`: builds the secondary packet PDF in the browser.
- `lib/server/`: the HarnessRouter adapter (Apache-2.0, from HarnessRouter's integration templates) and the bridge that keeps the key, Harness ID and upstream ids on the server.
- `public/samples/`: fictional carrier documents to try. Regenerate with `node scripts/make-samples.mjs`.

## Tests

```bash
npm test
```

## Limits of this version

- Every patient, carrier and amount in the demo is fictional. It is not set up for real patient records: there is no sign-in, cases are stored in the browser, and the agent endpoints are open with a per-task cost cap.
- The agent reads documents and drafts the cover letter. It does not call adjusters or log in to carrier portals.
