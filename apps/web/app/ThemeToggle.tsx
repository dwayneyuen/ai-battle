"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Light/dark toggle. The actual theme is applied via a `data-theme` attribute
 * on <html> — set before paint by the inline script in the layout (so there's
 * no flash) and flipped here on click. Choice persists in localStorage.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // On mount, read whatever the pre-paint script already applied.
  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as Theme) ?? "light";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore (private mode, etc.)
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
