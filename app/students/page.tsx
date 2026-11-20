"use client";

import { useMemo, useState } from "react";
import { buildLetter, buildPlan, type Answers } from "./rules";

const C = { bg: "#f6f5f0", ink: "#121212", t2: "#5b5b56", line: "#e4e2da", card: "#ffffff", accent: "#c4e34a", soft: "#eeede6" };
const box: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 };
const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "0 0 8px", color: C.ink };
const field: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 15, background: "#fff", color: C.ink };

function Btn(p: { children: React.ReactNode; onClick?: () => void; kind?: "primary" | "dark" | "ghost"; disabled?: boolean }) {
  const k = p.kind || "dark";
  return (
    <button
      type="button"
      onClick={p.onClick}
      disabled={p.disabled}
      style={{
        height: 44,
        padding: "0 18px",
        borderRadius: 10,
        fontSize: 15,
        fontWeight: 600,
        cursor: p.disabled ? "default" : "pointer",
        opacity: p.disabled ? 0.5 : 1,
        border: k === "ghost" ? `1px solid ${C.ink}` : "none",
        background: k === "primary" ? C.accent : k === "dark" ? C.ink : "transparent",
        color: k === "dark" ? "#fff" : C.ink,
      }}
    >
      {p.children}
    </button>
  );
}

function Pick<T extends string>(p: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div>
      <span style={lbl}>{p.label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {p.options.map(([v, t]) => (
          <button
            key={v}
            type="button"
            aria-pressed={p.value === v}
            onClick={() => p.onChange(v)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 14,
              cursor: "pointer",
              border: `1px solid ${p.value === v ? C.ink : C.line}`,
              background: p.value === v ? C.ink : "#fff",
              color: p.value === v ? "#fff" : C.ink,
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

const MAYA: Answers = { state: "CA", role: "passenger", householdAuto: "yes", medpay: "yes", otherAtFault: "yes", health: "ship", bill: 2400 };

const STEPS = [
  { k: "bill", t: "The bill arrives", d: "Maya, a Berkeley junior on UC SHIP, was rear-ended on Telegraph Ave while riding with a friend. Two weeks later the ER sends her a $2,400 bill. She has no idea who should pay it." },
  { k: "ask", t: "Six quick questions", d: "AutoCOB asks only what decides the payer order: the state, her role in the crash, car insurance, MedPay, fault and her health plan." },
  { k: "plan", t: "Who pays, in order", d: "California is an at-fault state. MedPay on the car policy pays first, then UC SHIP, and the other driver's insurer pays back later. Each step says exactly what Maya should do." },
  { k: "help", t: "Hear it, ask anything", d: "Maya can hear her plan read aloud by ElevenLabs, or ask a question in plain words. Vercel AI Gateway answers, grounded in her plan, so it never makes up limits." },
  { k: "send", t: "Send the message", d: "AutoCOB writes the message for the hospital's billing office: bill these payers in this order, and don't send this to collections. Maya copies it and sends it." },
] as const;

export default function StudentsPage() {
  const [mode, setMode] = useState<"home" | "tour" | "free">("home");
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(MAYA);
  const [name, setName] = useState("Maya Chen");
  const [q, setQ] = useState("The hospital says it will send my bill to collections. What do I do?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const plan = useMemo(() => buildPlan(a), [a]);
  const letter = useMemo(() => buildLetter(a, plan, name), [a, plan, name]);
  const set = <K extends keyof Answers>(k: K) => (v: Answers[K]) => setA((s) => ({ ...s, [k]: v }));

  async function ask() {
    setAsking(true);
    setAnswer(null);
    try {
      const r = await fetch("/api/students/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, plan }) });
      const d = await r.json();
      setAnswer(r.ok ? d.answer : "The AI helper is offline right now. Your plan still applies: ask the hospital to bill your coverage in the order shown and hold the account.");
    } catch {
      setAnswer("The AI helper is offline right now. Your plan still applies.");
    } finally {
      setAsking(false);
    }
  }

  async function listen() {
    const text = `${plan.headline} ${plan.steps.map((s, i) => `Step ${i + 1}: ${s.who}. ${s.youDo}`).join(" ")}`;
    setSpeaking(true);
    try {
      const r = await fetch("/api/students/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error("offline");
      const audio = new Audio(URL.createObjectURL(await r.blob()));
      audio.onended = () => setSpeaking(false);
      await audio.play();
    } catch {
      const u = new SpeechSynthesisUtterance(text);
      u.onend = () => setSpeaking(false);
      window.speechSynthesis?.speak(u);
    }
  }

  const Bill = (
    <div style={{ ...box, maxWidth: 520 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p style={{ margin: 0, fontWeight: 700 }}>Bay Area Medical Center</p>
        <p style={{ margin: 0, fontSize: 12, color: C.t2 }}>Statement · Sample</p>
      </div>
      <p style={{ margin: "4px 0 18px", fontSize: 13, color: C.t2 }}>Patient: Maya Chen · Emergency visit, Nov 2</p>
      {[["ER visit, level 4", "$1,650"], ["CT scan, neck", "$600"], ["Supplies", "$150"]].map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${C.line}`, fontSize: 14 }}>
          <span>{k}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 0", borderTop: `2px solid ${C.ink}`, fontWeight: 700, fontSize: 18 }}>
        <span>Amount due</span>
        <span>$2,400.00</span>
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 13, background: "#fbe9e4", padding: "10px 12px", borderRadius: 8 }}>Due in 30 days. Unpaid balances may be sent to collections.</p>
    </div>
  );

  const Questions = (
    <div style={{ ...box, display: "grid", gap: 18 }}>
      <div>
        <span style={lbl}>Where did the crash happen?</span>
        <select style={field} value={a.state} onChange={(e) => set("state")(e.target.value as Answers["state"])}>
          <option value="CA">California</option>
          <option value="NY">New York</option>
          <option value="NJ">New Jersey</option>
          <option value="FL">Florida</option>
          <option value="MI">Michigan</option>
          <option value="OTHER">Another state</option>
        </select>
      </div>
      <Pick label="You were the" value={a.role} onChange={set("role")} options={[["driver", "Driver"], ["passenger", "Passenger"], ["pedestrian", "Pedestrian"], ["cyclist", "Cyclist"]]} />
      <Pick label="Car insurance in your household?" value={a.householdAuto} onChange={set("householdAuto")} options={[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]} />
      <Pick label="Does the car policy have MedPay?" value={a.medpay} onChange={set("medpay")} options={[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]} />
      <Pick label="Was the other driver at fault?" value={a.otherAtFault} onChange={set("otherAtFault")} options={[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]} />
      <Pick label="Your health coverage" value={a.health} onChange={set("health")} options={[["ship", "Student plan (SHIP)"], ["parent", "Parent's plan"], ["medicaid", "Medi-Cal"], ["none", "None"]]} />
      <div>
        <label style={lbl} htmlFor="bill">Bill amount ($)</label>
        <input id="bill" style={field} type="number" min={0} value={a.bill || ""} onChange={(e) => set("bill")(Number(e.target.value) || 0)} />
      </div>
    </div>
  );

  const Plan = (
    <div style={{ background: C.ink, color: "#fff", borderRadius: 14, padding: 24 }}>
      <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: 2, fontWeight: 700, color: C.accent }}>WHO PAYS, IN ORDER</p>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, lineHeight: 1.3, fontWeight: 600 }}>{plan.headline}</h2>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 16 }}>
        {plan.steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: 14, paddingTop: i ? 16 : 0, borderTop: i ? "1px solid #2c2c2c" : "none" }}>
            <span style={{ flex: "0 0 30px", height: 30, borderRadius: 15, background: C.accent, color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{i + 1}</span>
            <div>
              <p style={{ margin: "2px 0 4px", fontWeight: 600 }}>{s.who}</p>
              <p style={{ margin: "0 0 6px", color: "#b5b5ad", fontSize: 14 }}>{s.covers}</p>
              <p style={{ margin: 0, fontSize: 14 }}>
                <b style={{ color: C.accent }}>You do →</b> {s.youDo}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {plan.warnings.length > 0 && (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: "#1f1f1f", fontSize: 13, color: "#dcdcd4" }}>
          {plan.warnings.map((w, i) => (
            <p key={i} style={{ margin: i ? "6px 0 0" : 0 }}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );

  const Help = (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>Hear your plan</p>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: C.t2 }}>Read aloud by ElevenLabs</p>
        </div>
        <Btn kind="primary" onClick={listen} disabled={speaking}>{speaking ? "Playing…" : "▶ Play"}</Btn>
      </div>
      <div style={box}>
        <span style={lbl}>Ask in plain words</span>
        <textarea style={{ ...field, minHeight: 80, resize: "vertical" }} value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ marginTop: 12 }}>
          <Btn onClick={ask} disabled={!q || asking}>{asking ? "Thinking…" : "Ask AutoCOB"}</Btn>
        </div>
        {answer && <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.55, padding: 14, background: C.soft, borderRadius: 10 }}>{answer}</p>}
        <p style={{ margin: "12px 0 0", fontSize: 12, color: C.t2 }}>Vercel AI Gateway, on our server, grounded in your plan. General information, not legal advice.</p>
      </div>
    </div>
  );

  const Letter = (
    <div style={box}>
      <span style={lbl}>Message to the billing office</span>
      <input style={{ ...field, marginBottom: 12 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, background: C.soft, padding: 16, borderRadius: 10, margin: "0 0 12px" }}>{letter}</pre>
      <Btn
        kind="primary"
        onClick={() => {
          navigator.clipboard?.writeText(letter);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied ✓" : "Copy message"}
      </Btn>
      <div style={{ marginTop: 16 }}>
        <span style={lbl}>Gather these</span>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
          {plan.checklist.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  const Top = (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0", borderBottom: `1px solid ${C.line}`, marginBottom: 28 }}>
      <button type="button" onClick={() => setMode("home")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: 0 }}>
        <span style={{ width: 28, height: 28, borderRadius: 7, background: C.ink, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>A</span>
        <span style={{ fontWeight: 700, fontSize: 17, color: C.ink }}>AutoCOB</span>
        <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: C.ink, color: "#fff" }}>for students</span>
      </button>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind={mode === "tour" ? "dark" : "ghost"} onClick={() => { setA(MAYA); setStep(0); setMode("tour"); }}>Guided demo</Btn>
        <Btn kind={mode === "free" ? "dark" : "ghost"} onClick={() => setMode("free")}>Try it yourself</Btn>
      </div>
    </header>
  );

  const view = STEPS[step].k;

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.ink }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 20px 48px" }}>
        {Top}

        {mode === "home" && (
          <section style={{ padding: "48px 0 24px", display: "grid", gap: 36 }}>
            <div>
              <p style={{ margin: "0 0 14px", fontSize: 13, letterSpacing: 2, fontWeight: 700, color: C.t2 }}>FOR STUDENTS AFTER A CAR ACCIDENT</p>
              <h1 style={{ margin: 0, fontSize: "clamp(40px, 6vw, 68px)", lineHeight: 1.02, fontWeight: 600, letterSpacing: -1.5, maxWidth: "16ch" }}>
                Know who pays every medical bill.
              </h1>
              <p style={{ margin: "20px 0 0", fontSize: 18, lineHeight: 1.5, color: C.t2, maxWidth: "58ch" }}>
                Car insurance, your student health plan, the other driver&apos;s insurer: each pays in a set order that changes by state. Get it wrong and the bill lands on you. AutoCOB tells you the order, what to ask for, and writes the message to the billing office.
              </p>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Btn kind="primary" onClick={() => { setA(MAYA); setStep(0); setMode("tour"); }}>Start guided demo →</Btn>
              <Btn kind="ghost" onClick={() => setMode("free")}>Try it with your own case</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              {[
                ["2.44M", "Americans hurt in car crashes in a year (NHTSA, 2023)"],
                ["3 payers", "can owe on one crash: car insurance, health plan, the other driver"],
                ["0 logins", "Nothing stored. Runs in your browser in under a minute."],
              ].map(([n, t]) => (
                <div key={n} style={box}>
                  <p style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>{n}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 14, color: C.t2 }}>{t}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {mode === "tour" && (
          <section style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 24, alignItems: "start" }}>
            <aside style={{ position: "sticky", top: 20, background: C.ink, color: "#fff", borderRadius: 14, padding: 22 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
                {STEPS.map((_, i) => (
                  <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? C.accent : "#3a3a3a" }} />
                ))}
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: 2, fontWeight: 700, color: C.accent }}>STEP {step + 1} OF {STEPS.length}</p>
              <h2 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{STEPS[step].t}</h2>
              <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.55, color: "#cfcfc7" }}>{STEPS[step].d}</p>
              <div style={{ display: "flex", gap: 8 }}>
                {step > 0 && (
                  <button type="button" onClick={() => setStep(step - 1)} style={{ height: 42, padding: "0 16px", borderRadius: 10, border: "1px solid #4a4a4a", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Back</button>
                )}
                {step < STEPS.length - 1 ? (
                  <button type="button" onClick={() => setStep(step + 1)} style={{ height: 42, padding: "0 18px", borderRadius: 10, border: "none", background: C.accent, color: C.ink, cursor: "pointer", fontWeight: 700 }}>Next →</button>
                ) : (
                  <button type="button" onClick={() => setMode("free")} style={{ height: 42, padding: "0 18px", borderRadius: 10, border: "none", background: C.accent, color: C.ink, cursor: "pointer", fontWeight: 700 }}>Try your own case →</button>
                )}
              </div>
            </aside>
            <div style={{ minWidth: 0 }}>
              {view === "bill" && Bill}
              {view === "ask" && Questions}
              {view === "plan" && Plan}
              {view === "help" && <div style={{ display: "grid", gap: 16 }}>{Plan}{Help}</div>}
              {view === "send" && Letter}
            </div>
          </section>
        )}

        {mode === "free" && (
          <section style={{ display: "grid", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, alignItems: "start" }}>
              {Questions}
              <div style={{ display: "grid", gap: 16 }}>{Plan}{Help}</div>
            </div>
            {Letter}
          </section>
        )}

        <p style={{ margin: "40px 0 0", fontSize: 12, color: C.t2 }}>
          AutoCOB · Berkeley Startup Sprint, Team Vikings. Sample patient and bill are fictional. General information, not legal advice. Built on AutoCOB&apos;s accident-billing engine for clinics (<a href="/demo" style={{ color: C.ink }}>biller demo</a>).
        </p>
      </div>
    </main>
  );
}
