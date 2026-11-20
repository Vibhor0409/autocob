"use client";

import { useMemo, useState } from "react";
import { buildLetter, buildPlan, type Answers } from "./rules";

const card: React.CSSProperties = { background: "#fff", border: "1px solid #d5dcdb", borderRadius: 16, padding: 24 };
const label: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 600, margin: "0 0 6px" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #c9d2d1", fontSize: 15, background: "#fff" };

function Pick<T extends string>(props: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div>
      <span style={label}>{props.label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {props.options.map(([v, t]) => (
          <button
            key={v}
            type="button"
            onClick={() => props.onChange(v)}
            aria-pressed={props.value === v}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 14,
              cursor: "pointer",
              border: props.value === v ? "1px solid #0a6a73" : "1px solid #c9d2d1",
              background: props.value === v ? "#0a6a73" : "#fff",
              color: props.value === v ? "#fff" : "#14213d",
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function StudentsPage() {
  const [a, setA] = useState<Answers>({
    state: "CA",
    role: "passenger",
    householdAuto: "yes",
    medpay: "unsure",
    otherAtFault: "yes",
    health: "ship",
    bill: 2400,
  });
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  async function listen() {
    const text = `${plan.headline} ${plan.steps.map((s, i) => `Step ${i + 1}: ${s.who}. ${s.youDo}`).join(" ")}`;
    setSpeaking(true);
    try {
      const r = await fetch("/api/students/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("offline");
      const url = URL.createObjectURL(await r.blob());
      const audio = new Audio(url);
      audio.onended = () => setSpeaking(false);
      await audio.play();
    } catch {
      // Fallback when ElevenLabs is not configured: the browser's own voice.
      const u = new SpeechSynthesisUtterance(text);
      u.onend = () => setSpeaking(false);
      window.speechSynthesis?.speak(u);
    }
  }
  const plan = useMemo(() => buildPlan(a), [a]);
  const letter = useMemo(() => buildLetter(a, plan, name), [a, plan, name]);
  const set = <K extends keyof Answers>(k: K) => (v: Answers[K]) => setA((s) => ({ ...s, [k]: v }));

  async function ask() {
    setAsking(true);
    setAnswer(null);
    try {
      const r = await fetch("/api/students/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, plan }),
      });
      const d = await r.json();
      setAnswer(r.ok ? d.answer : "The AI helper is offline right now. Your plan above still applies.");
    } catch {
      setAnswer("The AI helper is offline right now. Your plan above still applies.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main style={{ background: "#f4f6f5", minHeight: "100vh", color: "#14213d", padding: "40px 16px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: "#0a6a73", margin: 0 }}>AUTOCOB FOR STUDENTS</p>
        <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: "8px 0 8px", fontWeight: 700 }}>In a car accident? Find out who pays each medical bill.</h1>
        <p style={{ fontSize: 17, color: "#4a5568", margin: "0 0 28px", maxWidth: 760 }}>
          Answer six questions. AutoCOB shows the order your insurers should pay in, what to ask each one for, and writes the message to send the billing office so the bill doesn&apos;t land on you.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
          <section style={{ ...card, display: "grid", gap: 18 }} aria-label="Your situation">
            <div>
              <span style={label}>Where did the crash happen?</span>
              <select style={input} value={a.state} onChange={(e) => set("state")(e.target.value as Answers["state"])}>
                <option value="CA">California</option>
                <option value="NY">New York</option>
                <option value="NJ">New Jersey</option>
                <option value="FL">Florida</option>
                <option value="MI">Michigan</option>
                <option value="OTHER">Another state</option>
              </select>
            </div>
            <Pick label="You were the..." value={a.role} onChange={set("role")} options={[["driver", "Driver"], ["passenger", "Passenger"], ["pedestrian", "Pedestrian"], ["cyclist", "Cyclist"]]} />
            <Pick label="Does your household (you or your parents) have car insurance?" value={a.householdAuto} onChange={set("householdAuto")} options={[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]} />
            <Pick label="Does the car policy include MedPay?" value={a.medpay} onChange={set("medpay")} options={[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]} />
            <Pick label="Was the other driver at fault?" value={a.otherAtFault} onChange={set("otherAtFault")} options={[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]} />
            <Pick label="Your health coverage" value={a.health} onChange={set("health")} options={[["ship", "Student plan (SHIP)"], ["parent", "Parent's plan"], ["medicaid", "Medi-Cal / Medicaid"], ["none", "None"]]} />
            <div>
              <label style={label} htmlFor="bill">Biggest bill so far ($)</label>
              <input id="bill" style={input} type="number" min={0} value={a.bill || ""} onChange={(e) => set("bill")(Number(e.target.value) || 0)} />
            </div>
          </section>

          <section style={{ display: "grid", gap: 20 }} aria-label="Who pays">
            <div style={{ ...card, background: "#14213d", color: "#f2f4f1", border: "none" }}>
              <p style={{ fontSize: 13, letterSpacing: 2, color: "#6fd0c2", margin: "0 0 6px", fontWeight: 700 }}>WHO PAYS, IN ORDER</p>
              <h2 style={{ fontSize: 22, margin: "0 0 12px", lineHeight: 1.3 }}>{plan.headline}</h2>
              <button
                type="button"
                onClick={listen}
                disabled={speaking}
                style={{ margin: "0 0 16px", padding: "8px 14px", borderRadius: 999, border: "1px solid #6fd0c2", background: "transparent", color: "#6fd0c2", fontWeight: 600, cursor: "pointer" }}
              >
                {speaking ? "Playing..." : "🔊 Hear my plan (ElevenLabs)"}
              </button>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 14 }}>
                {plan.steps.map((s, i) => (
                  <li key={i} style={{ display: "flex", gap: 14 }}>
                    <span style={{ flex: "0 0 32px", height: 32, borderRadius: 16, background: "#6fd0c2", color: "#14213d", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{i + 1}</span>
                    <div>
                      <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{s.who}</p>
                      <p style={{ margin: "0 0 4px", color: "#bfd8d5", fontSize: 14 }}>{s.covers}</p>
                      <p style={{ margin: 0, fontSize: 14 }}>
                        <b style={{ color: "#6fd0c2" }}>You do:</b> {s.youDo}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {plan.warnings.length > 0 && (
              <div style={{ ...card, background: "#fff7ed", borderColor: "#f3c9a0" }}>
                {plan.warnings.map((w, i) => (
                  <p key={i} style={{ margin: i ? "8px 0 0" : 0, fontSize: 14 }}>⚠️ {w}</p>
                ))}
              </div>
            )}

            <div style={card}>
              <p style={{ ...label, fontSize: 16 }}>Gather these</p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
                {plan.checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginTop: 20 }}>
          <section style={card} aria-label="Message to the billing office">
            <p style={{ ...label, fontSize: 16 }}>Message for the billing office</p>
            <input style={{ ...input, marginBottom: 10 }} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, background: "#f4f6f5", padding: 14, borderRadius: 10, margin: "0 0 10px" }}>{letter}</pre>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(letter);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#0a6a73", color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              {copied ? "Copied" : "Copy message"}
            </button>
          </section>

          <section style={card} aria-label="Ask a question">
            <p style={{ ...label, fontSize: 16 }}>Still confused? Ask in plain words</p>
            <textarea style={{ ...input, minHeight: 90 }} placeholder="e.g. The hospital sent my bill to collections. What do I do?" value={q} onChange={(e) => setQ(e.target.value)} />
            <button
              type="button"
              disabled={!q || asking}
              onClick={ask}
              style={{ marginTop: 10, padding: "10px 18px", borderRadius: 10, border: "none", background: q ? "#14213d" : "#9aa5a4", color: "#fff", fontWeight: 600, cursor: q ? "pointer" : "default" }}
            >
              {asking ? "Thinking..." : "Ask AutoCOB"}
            </button>
            {answer && <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 12 }}>{answer}</p>}
            <p style={{ fontSize: 12, color: "#4a5568", marginTop: 12 }}>Answers use Vercel AI Gateway on our server, grounded in your plan above. General information, not legal advice.</p>
          </section>
        </div>
        <p style={{ fontSize: 12, color: "#4a5568", marginTop: 24 }}>
          Built at Berkeley Startup Sprint on top of AutoCOB, our accident-billing agent for clinics (<a href="/demo" style={{ color: "#0a6a73" }}>see the biller demo</a>). No data is stored; everything above runs in your browser.
        </p>
      </div>
    </main>
  );
}
