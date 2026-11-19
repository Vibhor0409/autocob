import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Create a workspace: AutoCOB" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  if (await getSession()) redirect("/app");
  const invite = (await searchParams).invite;
  return <AuthForm kind="signup" invite={typeof invite === "string" ? invite.slice(0, 100) : undefined} />;
}
