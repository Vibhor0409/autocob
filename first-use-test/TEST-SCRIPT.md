# AutoCOB first-use test

One fictional accident case, entered by hand, with five carrier documents to upload in order. It takes about 15 minutes. Every name, number and amount is made up.

This exact sequence was run through the live site on 2026-11-19 and behaved as written below.

## Before you start

1. Go to https://autocob.vercel.app/signup.
2. Use your own name, email and a password of at least 10 characters.
3. For **Clinic or company name**, type exactly: `Northside Spine and Rehab`

The name matters. The carrier documents pay "Northside Spine and Rehab", and AutoCOB uses the workspace name to tell your clinic's payments apart from other providers'. If you already created a workspace under another name, rename it on the **Team** page before step 1.

## Step 1: open the case

Press **New case** and enter:

| Field | Value |
|---|---|
| Patient reference | `J.R. chart 20417` |
| Date of accident | 2026-08-03 |
| Type of accident | Auto accident |
| Coverage that pays first | PIP |
| Carrier | `Granite State Auto` |
| Claim number | `GSA-26-118842` |
| Policy limit ($) | `5000` |
| Adjuster fields | leave blank |
| Health plan | `Meridian Health PPO` |
| Member ID | `MHP-55172093` |
| Filing window (days) | `60` |

**Expect:** the case opens with next step "Verify the claim with the adjuster".

## Step 2: add six visits

Press **Add a visit** six times. Amount billed is `250` each; service can be `Spinal manipulation and therapy`.

| Visit | Date |
|---|---|
| 1 | 2026-08-24 |
| 2 | 2026-08-31 |
| 3 | 2026-09-08 |
| 4 | 2026-09-15 |
| 5 | 2026-09-22 |
| 6 | 2026-09-29 |

**Expect:** Visits shows 6 visits, $1,500.00 billed, all "Waiting on carrier".

## Step 3: upload the documents in order

The files are in the `documents` folder next to this script. Drop each one on the **Documents** section (or use **Add a document**). The agent takes 35 to 45 seconds per file. Check what it read, then press **Approve and file**.

| File | What the agent should propose | After you approve |
|---|---|---|
| `1-claim-acknowledgement.pdf` | Mark the claim confirmed; update the adjuster to Dana Whitfield | Step 1 of the case shows done; next step "Nothing waiting on you" |
| `2-carrier-eob.pdf` | Record 4 carrier payments totalling $1,000.00 | Visits 1 to 4 show "Paid by carrier"; $4,000.00 remaining |
| `3-payout-log.pdf` | Record 2 carrier payments totalling $4,000.00, both to other providers | Limit reached; visits 5 and 6 turn red, "Stuck: no letter", $500.00; next step "Request the exhaustion letter" |
| `5-letter-for-another-patient.pdf` | Nothing: it is refused, because it is for claim GSA-26-200001 | Press **Discard**; the case is unchanged |
| `4-exhaustion-letter.pdf` | File the exhaustion letter and release the unpaid visits to Meridian Health PPO | Visits 5 and 6 turn blue, "Ready for health plan"; next step "Send the secondary packet" |

The benefit bar is the thing to watch at file 3: the emergency room and imaging center used $4,000 of a $5,000 limit that the clinic could not see from its own records.

## Step 4: build and send the packet

1. Press **Build with an agent-written letter** (about 40 seconds), or **Build the packet** for the standard letter.
2. Press **Download the packet (PDF)**.
3. Press **Mark as sent to Meridian Health PPO**.

**Expect:** a PDF with the cover letter, the visit ledger with visits 5 and 6 in bold, and the carrier's EOB, payout log and exhaustion letter appended. After marking it sent, all four case steps show done and next step reads "Nothing waiting on you".

Because the filing window is 60 days, visits 5 and 6 show file-by dates of 2026-11-21 and 2026-11-28 in red. If you run this test after those dates, the day counts go negative; that is the deadline warning working, not a fault.

## Step 5: the rest of the product

- **Worklist:** type `Granite` in the search box; try the Needs action and Done filters; press **Export CSV**.
- **Record a carrier payment:** add a seventh visit, then record a $250 payment for it by hand.
- **Edit details:** change the filing window to 90 and watch the file-by dates move.
- **Team:** open **Team**, create an invite link, and open it in a private window to join as a second person. Both of you see the same case.
- **Reload the page** at any point: everything you did is still there.

## What to note down

- Any step where what you saw differs from the "Expect" line.
- Any wording you had to read twice.
- How long each document read took.
- Whether the agent's note under each reading was useful or noise.
