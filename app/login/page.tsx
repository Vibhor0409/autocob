import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Sign in: AutoCOB" };

export default async function LoginPage() {
  if (await getSession()) redirect("/app");
  return <AuthForm kind="login" />;
}
