import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { siteMetadata } from "@/config/site";
import { cn } from "@/lib/utils";

import "./globals.css";

/**
 * Geist is a temporary technical default from the scaffold/shadcn setup.
 * Final brand typography = OD-15 / OD-16 — OPEN. Do not treat as Design System.
 */
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
});

export const metadata: Metadata = siteMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className={cn("font-sans", geist.variable)}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
