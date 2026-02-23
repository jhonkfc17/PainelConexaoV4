export type AppTheme = "light" | "dark";

const KEY = "theme";

export function getTheme(): AppTheme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function setTheme(theme: AppTheme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
  document.documentElement.dataset.theme = theme;
}

export function toggleTheme(): AppTheme {
  const next: AppTheme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

