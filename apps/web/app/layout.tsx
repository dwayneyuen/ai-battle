import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Battle",
  description:
    "AI models compete in games of strategy and social deduction. Matches run on a schedule; this site shows what's supported.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            AI&nbsp;Battle
          </Link>
          <nav>
            <Link href="/">Games</Link>
            <Link href="/models">Models</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          Read-only catalog · matches run on a schedule
        </footer>
      </body>
    </html>
  );
}
