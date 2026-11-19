# Brag plan: AutoCOB

- **Format:** landscape 1920x1080, 60 seconds (the user asked for a one-minute pitch-then-demo, which is why this runs past the usual 15 to 25 seconds).
- **Tone:** polished. This is a billing tool for clinics; nothing in it is a joke.
- **Voice:** off (not requested with `--voice`). Music on, SFX off.
- **Angle:** open on the product's own headline, name who it is for, give three sourced numbers on why the problem is common, show the mechanism (a shared limit the clinic cannot see), then show the real product doing the work.

## Storyboard

| # | Time | Scene | On screen |
|---|---|---|---|
| 1 | 0.0 to 5.7 | Hook | "The auto policy ran out on visit 14." / "The health plan still doesn't know." (landing page headline) |
| 2 | 5.7 to 12.0 | Who it is for | "Built for the people who work these claims": accident billing companies; multi-location clinic groups (PT, orthopedic, chiropractic) |
| 3 | 12.0 to 26.2 | Why it matters | 2.44 million injured in U.S. traffic crashes, 2023 (NHTSA). 12 no-fault states where auto insurance pays first, up to a limit. 41% of providers report denial rates of 10% or more (Experian State of Claims 2025). |
| 4 | 26.2 to 33.0 | The mechanism | Benefit bar fills: other providers $4,000, this clinic $1,000, limit line, $500 past the limit. "Every provider draws on the same limit." |
| 5 | 33.0 to 54.0 | Product | Four real screens: worklist, agent reading of the payout log, $500 stuck, packet ready. |
| 6 | 54.0 to 60.0 | Outro | Logo, "Accident billing that knows when the auto policy runs out", autocob.vercel.app, "Case agent runs on HarnessRouter". |

## Grounding

- Headline, audience, feature lines and the $4,000 / $1,000 / $500 figures come from the landing page and the first-use test case in this repo.
- NHTSA: 2,442,581 people injured in police-reported crashes in 2023.
- Experian State of Claims 2025: 41% of providers report denial rates of 10% or higher.
- Twelve no-fault states: Experian and CarInsurance.com consumer guides (lists differ slightly on which twelve).
- The agent-reading screen replays the agent's reading from the verified live run of the same documents; the agent was out of trial credit at capture time.

## Music cue guidance

Track: happy-beats-business-moves-vol-10 (60.0s, about 110 BPM). Scene cuts sit near beats at 5.74, 12.02 and 26.2. Natural timing wins wherever text needs longer to read.
