import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Worklist: AutoCOB" };

export default async function AppPage() {
  if (!(await getSession())) redirect("/login");
  return <Workspace mode="live" />;
}
