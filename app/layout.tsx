import type { Metadata } from "next";
import { Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const ui = Schibsted_Grotesk({ variable: "--font-ui", subsets: ["latin"] });
const figures = Spline_Sans_Mono({ variable: "--font-figures", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AutoCOB: accident billing that knows when the auto policy runs out",
  description:
    "AutoCOB tracks each injured patient's auto or workers' comp benefit, reads carrier documents, and assembles the packet the health plan needs to pay.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ui.variable} ${figures.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
