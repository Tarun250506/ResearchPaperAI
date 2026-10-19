
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResearchPaper AI | Research Workspace",
  description:
    "An AI-powered research workspace for exploring papers, retrieving evidence, and comparing academic findings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
