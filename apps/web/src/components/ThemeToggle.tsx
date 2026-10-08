'use client';

/**
 * Day/night theme switch. The resolved theme lives as `data-theme` on the <html>
 * element, set before paint by the inline script in the root layout (so there is
 * no flash). This button flips it and persists the explicit choice to
 * localStorage; with no stored choice the app follows the OS preference.
 *
 * Rendering is gated on mount: the server and first client render both show a
 * hidden placeholder, so the icon (which depends on the live DOM attribute)
 * never causes a hydration mismatch.
 */

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ohb-theme';

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode) — the in-memory choice still applies */
    }
    setTheme(next);
  }

  const className = `btn btn--ghost btn--sm theme-toggle${floating ? ' theme-toggle--floating' : ''}`;

  // Pre-mount: stable placeholder so SSR and hydration agree.
  if (theme === null) {
    return <button type="button" className={className} aria-hidden style={{ visibility: 'hidden' }} />;
  }

  const dark = theme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className={className} onClick={toggle} aria-label={label} title={label}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
