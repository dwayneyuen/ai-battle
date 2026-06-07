import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Battle",
  description:
    "AI models compete in games of strategy and social deduction. Matches run on a schedule; this site shows what's supported.",
};

// Applies the saved theme before paint so there's no flash. Defaults to light
// (no attribute) unless the visitor previously chose a theme.
const themeScript = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <header className="site-header">
          <Link href="/" className="brand">
            AI&nbsp;Battle
          </Link>
          <nav>
            <Link href="/">Games</Link>
            <Link href="/models">Models</Link>
            <ThemeToggle />
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
