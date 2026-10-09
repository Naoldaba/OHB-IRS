'use client';

/**
 * A single collapsible group in the header nav: a trigger button that opens a
 * dropdown of related links. Used to fold the admin-only administration pages
 * (Labs, Users, Permissions) behind one entry so the top nav stays legible.
 * Closes on outside click, Escape, or navigation; the trigger reads active
 * while any child route is the current page. Visibility here is cosmetic — the
 * API remains the authority on what each role may actually reach.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

export type NavLink = { href: string; label: string; cap?: string };

export function NavMenu({ label, items }: { label: string; items: NavLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const isLinkActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const groupActive = items.some((item) => isLinkActive(item.href));

  // Close on outside click / Escape — same affordance as the notification panel.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Collapse once the route changes (a child link was followed).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="nav__group" ref={rootRef}>
      <button
        type="button"
        className={`nav__trigger${groupActive ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <ChevronDown size={14} className="nav__chevron" aria-hidden />
      </button>

      {open && (
        <div className="nav__menu" role="menu">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className={isLinkActive(item.href) ? 'active' : ''}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
