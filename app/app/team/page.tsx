import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TeamPanel } from "@/components/TeamPanel";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Team: AutoCOB" };

export default async function TeamPage() {
  if (!(await getSession())) redirect("/login");
  return <TeamPanel />;
}
