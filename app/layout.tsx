import type { Metadata } from "next";
import "./globals.css";
import Shell from "@/components/Shell";

export const metadata: Metadata = { title: "Sponsorship Growth Center", description: "CampusFest sponsorship command center: funnel analytics, campaign management and an AI growth analyst" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="antialiased"><Shell>{children}</Shell></body></html>);
}
