import { NextResponse } from "next/server";

// Server-side only: the Vercel AI Gateway key never reaches the browser.
export async function POST(req: Request) {
  // Event key if set; otherwise Vercel's own OIDC token, which AI Gateway accepts on Vercel deployments.
  const key = process.env.AI_GATEWAY_API_KEY || req.headers.get("x-vercel-oidc-token") || process.env.VERCEL_OIDC_TOKEN;
  if (!key) return NextResponse.json({ error: "AI explanation is not configured" }, { status: 503 });
  const { question, plan } = (await req.json()) as { question?: string; plan?: unknown };
  if (!question || question.length > 600) return NextResponse.json({ error: "Ask a short question" }, { status: 400 });

  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.AI_GATEWAY_MODEL || "openai/gpt-4o-mini",
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You help a college student understand who pays their medical bills after a car accident. Answer in plain words, under 120 words. Use only the payer plan given; never invent dollar limits. Say it is general information, not legal advice, when the question is legal.",
        },
        { role: "user", content: `My payer plan: ${JSON.stringify(plan).slice(0, 4000)}\n\nMy question: ${question}` },
      ],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return NextResponse.json({ error: "The AI service did not answer", status: res.status, detail }, { status: 502 });
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return NextResponse.json({ answer: data.choices?.[0]?.message?.content ?? "" });
}
