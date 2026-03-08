"use client";

import { useEffect, useState } from "react";
import { initializeThemeFromStorage, setTheme as setStoredTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  return <ThemeToggleButton />;
}

type ThemeToggleButtonProps = {
  iconOnly?: boolean;
  className?: string;
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 14.7A8.5 8.5 0 1 1 9.3 3.5 7 7 0 0 0 20.5 14.7Z" />
    </svg>
  );
}

export function ThemeToggleButton({ iconOnly = false, className }: ThemeToggleButtonProps = {}) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const { theme: savedTheme } = initializeThemeFromStorage();
    setThemeState(savedTheme);

    const onThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme: Theme }>;
      setThemeState(customEvent.detail.theme);
    };

    window.addEventListener("nagarwatch:theme-change", onThemeChange as EventListener);
    return () => window.removeEventListener("nagarwatch:theme-change", onThemeChange as EventListener);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setStoredTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={className ?? "btn-secondary px-3 py-1.5 text-xs"}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Dark mode" : "Light mode"}
    >
      <span className="inline-flex items-center gap-2">
        {theme === "light" ? <MoonIcon /> : <SunIcon />}
        {iconOnly ? null : <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>}
      </span>
    </button>
  );
}
