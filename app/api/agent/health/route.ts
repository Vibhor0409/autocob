import { connection } from "next/server";
import { agentConnected } from "@/lib/server/agent";

export async function GET() {
  await connection(); // answer per request: the key can be added after the build
  return Response.json({ connected: agentConnected() }, { headers: { "Cache-Control": "no-store" } });
}
