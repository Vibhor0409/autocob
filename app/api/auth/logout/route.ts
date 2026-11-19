import { endSession, json, sameOrigin } from "@/lib/server/auth";

export async function POST() {
  if (!(await sameOrigin())) return json({ message: "Request refused." }, 403);
  await endSession();
  return json({ ok: true });
}
