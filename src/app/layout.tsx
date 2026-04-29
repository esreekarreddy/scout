import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scout - patch tournament for AI-written code",
  description:
    "Eval-backed agents catch AI-code failures, run competing repairs, score patches, and export a tournament receipt.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
