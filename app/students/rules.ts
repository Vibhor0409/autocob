export type StateCode = "CA" | "NY" | "NJ" | "FL" | "MI" | "OTHER";
export type Health = "ship" | "parent" | "medicaid" | "none";
export type Answers = {
  state: StateCode;
  role: "driver" | "passenger" | "pedestrian" | "cyclist";
  householdAuto: "yes" | "no" | "unsure";
  medpay: "yes" | "no" | "unsure";
  otherAtFault: "yes" | "no" | "unsure";
  health: Health;
  bill: number;
};
export type Step = { who: string; covers: string; youDo: string };
export type Plan = { kind: "no-fault" | "fault"; headline: string; steps: Step[]; checklist: string[]; warnings: string[] };

const PIP: Record<"NY" | "NJ" | "FL" | "MI", string> = {
  NY: "No-fault (PIP) covers up to $50,000 of medical bills, no matter who caused the crash. Providers must bill within 45 days of care.",
  NJ: "PIP covers up to $15,000 on a basic policy or $250,000 on a standard one. Some New Jersey drivers chose their health plan to pay first, so check the policy.",
  FL: "PIP covers 80% of medical bills up to $10,000, or $2,500 without an emergency diagnosis. You must get care within 14 days of the crash.",
  MI: "PIP limits depend on the level the policyholder picked after the 2019 reform, from $50,000 up to unlimited.",
};

const healthName: Record<Health, string> = {
  ship: "your student health plan (for example UC SHIP)",
  parent: "your parent's health plan",
  medicaid: "Medi-Cal / Medicaid",
  none: "no health plan",
};

export function buildPlan(a: Answers): Plan {
  const hn = healthName[a.health];
  const steps: Step[] = [];
  const warnings: string[] = [];
  const checklist = [
    "Police or accident report number",
    "Auto claim number and the adjuster's name and phone",
    "A photo of your health insurance card (front and back)",
    "Every explanation of benefits (EOB) you receive, saved in one folder",
    "Itemized bills from every provider: ambulance, ER, imaging, therapy",
  ];
  const noFault = a.state === "NY" || a.state === "NJ" || a.state === "FL" || a.state === "MI";

  if (noFault) {
    const st = a.state as "NY" | "NJ" | "FL" | "MI";
    const autoSource =
      a.householdAuto === "yes"
        ? "your household's car insurance (yours or your parents')"
        : a.role === "pedestrian" || a.role === "cyclist"
          ? "the car insurance of the vehicle that hit you"
          : "the car insurance of the vehicle you were in";
    steps.push({
      who: `Personal Injury Protection (PIP) from ${autoSource}`,
      covers: PIP[st],
      youDo: "Give every provider the auto claim number at check-in so they bill PIP first, not you.",
    });
    if (a.health !== "none") {
      steps.push({
        who: `Then ${hn}`,
        covers: "Pays the bills left over once PIP is used up.",
        youDo: "Ask the auto insurer for a PIP exhaustion letter. The health plan will not pay without proof that PIP ran out.",
      });
      checklist.push("PIP exhaustion letter (or payout log) from the auto insurer");
    } else {
      warnings.push(
        "With no health plan, bills past the PIP limit fall on you. Ask the hospital about financial assistance (charity care) and apply for Medicaid, which can cover bills from up to 3 months back.",
      );
    }
    if (a.otherAtFault !== "no") {
      steps.push({
        who: "Then the at-fault driver's liability insurer",
        covers: "Only for serious injuries or costs beyond PIP, depending on your state's threshold.",
        youDo: "Talk to a lawyer before signing any release from the other driver's insurer.",
      });
    }
  } else {
    if (a.medpay !== "no") {
      steps.push({
        who: "Medical Payments coverage (MedPay), if the car policy has it",
        covers: "Optional coverage, often $1,000 to $10,000, paid no matter who was at fault.",
        youDo: "Call the auto insurer and ask: \"Does this policy have MedPay, and what is the limit?\"",
      });
    }
    if (a.health !== "none") {
      steps.push({
        who: `${a.medpay !== "no" ? "Then" : "First,"} ${hn}`,
        covers: "Pays your bills now at its normal rates. You owe only your copay or deductible.",
        youDo: "Make sure every provider bills your health plan. Don't let them hold the bill until the case settles.",
      });
      if (a.medpay !== "no") checklist.push("MedPay exhaustion letter from the auto insurer, for your health plan");
    } else {
      warnings.push(
        "With no health plan, ask each provider for financial assistance and apply for Medi-Cal or Medicaid. Coverage can reach back up to 3 months.",
      );
    }
    if (a.otherAtFault !== "no") {
      steps.push({
        who: "Later, the at-fault driver's liability insurer",
        covers: "Pays you back through a claim. Your health plan may be repaid from that money (a lien).",
        youDo: "Report the claim to your health plan when it asks, and keep every EOB.",
      });
    }
  }
  if (a.state === "OTHER")
    warnings.push(
      "Rules vary by state. About 12 states use PIP (no-fault); most others work like California. Check your state insurance department's site.",
    );
  if (a.bill > 0 && a.health !== "none")
    warnings.push(
      `Don't pay the $${a.bill.toLocaleString()} bill out of pocket until every payer above has been billed. Ask the provider to put the account on hold while claims process.`,
    );
  return {
    kind: noFault ? "no-fault" : "fault",
    headline: noFault
      ? "Your state is no-fault: car insurance pays first, then your health plan."
      : "Your state is at-fault: your health plan pays now, and the other driver's insurer pays back later.",
    steps,
    checklist,
    warnings,
  };
}

export function buildLetter(a: Answers, p: Plan, name: string): string {
  const order = p.steps
    .map((s, i) => `${i + 1}. ${s.who.replace(/^(Then|First,|Later,)\s*/i, "")}`)
    .join("\n");
  return `Hello,

I'm writing about my bill${a.bill ? ` for $${a.bill.toLocaleString()}` : ""} for care after a car accident. Please don't send this account to me or to collections while insurance is processed. Please bill my coverage in this order:

${order}

I'll send the auto claim number, my health insurance details${p.kind === "no-fault" ? " and the PIP exhaustion letter when I receive it" : ""}. Please reply with anything else you need from me.

Thank you,
${name || "[Your name]"}`;
}
