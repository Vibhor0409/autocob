import type { Metadata } from "next";
import { Workspace } from "@/components/Workspace";

export const metadata: Metadata = { title: "Workspace: AutoCOB" };

export default function WorkspacePage() {
  return <Workspace />;
}
