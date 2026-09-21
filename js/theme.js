// Theme is stored as system/light/dark. "system" means: set no attribute and let the
// media query in app.css decide.

import { getTheme } from './store.js';

const META_COLORS = { dark: '#0b0b0f', light: '#f2f2f7' };

export function applyTheme() {
  const theme = getTheme();
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const effective = theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLORS[effective]);
}

export function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme();
  });
}
