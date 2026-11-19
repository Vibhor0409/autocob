import type { Metadata } from "next";
import { Workspace } from "@/components/Workspace";

export const metadata: Metadata = { title: "Demo workspace: AutoCOB" };

export default function DemoPage() {
  return <Workspace mode="demo" />;
}
