export type Theme = "light" | "dark";

export type DarkPalette = "mono" | "blue" | "green" | "purple";

export const THEME_KEY = "nagarwatch_theme";
export const DARK_PALETTE_KEY = "nagarwatch_dark_palette";

export const DEFAULT_THEME: Theme = "light";
export const DEFAULT_DARK_PALETTE: DarkPalette = "mono";

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const value = window.localStorage.getItem(THEME_KEY);
  return value === "dark" ? "dark" : "light";
}

export function readStoredDarkPalette(): DarkPalette {
  if (typeof window === "undefined") {
    return DEFAULT_DARK_PALETTE;
  }

  const value = window.localStorage.getItem(DARK_PALETTE_KEY);
  if (value === "blue" || value === "green" || value === "purple" || value === "mono") {
    return value;
  }

  return DEFAULT_DARK_PALETTE;
}

export function applyTheme(theme: Theme, darkPalette?: DarkPalette) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.dataset.darkPalette = darkPalette ?? readStoredDarkPalette();
  } else {
    root.classList.remove("dark");
    delete root.dataset.darkPalette;
  }

  notifyThemeChange(theme, darkPalette ?? readStoredDarkPalette());
}

export function setTheme(theme: Theme) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_KEY, theme);
  }

  applyTheme(theme, readStoredDarkPalette());
}

export function setDarkPalette(palette: DarkPalette) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DARK_PALETTE_KEY, palette);
  }

  if (readStoredTheme() === "dark") {
    applyTheme("dark", palette);
  } else {
    notifyThemeChange("light", palette);
  }
}

export function initializeThemeFromStorage() {
  const theme = readStoredTheme();
  const darkPalette = readStoredDarkPalette();
  applyTheme(theme, darkPalette);
  return { theme, darkPalette };
}

function notifyThemeChange(theme: Theme, darkPalette: DarkPalette) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("nagarwatch:theme-change", {
      detail: { theme, darkPalette },
    }),
  );
}
