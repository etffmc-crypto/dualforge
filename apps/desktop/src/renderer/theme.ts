export type Theme = 'dark' | 'light';
export const THEME_KEY = 'dualforge.theme';

/** Last theme the user picked, remembered locally so the first paint is already right (storage may be unavailable). */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* a convenience only; settings.json stays the source of truth */
  }
}

/** Runs before React mounts: puts the remembered theme on <html> so there is no dark→light flash. */
export function bootTheme(): void {
  document.documentElement.dataset.theme = readStoredTheme();
}
