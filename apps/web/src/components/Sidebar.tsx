'use client';

/**
 * The authenticated app's left navigation rail. Renders the role-aware nav model
 * from PageShell as a vertical sidebar that can collapse to an icon-only rail
 * (labels hidden, tooltips on hover) or slide in off-canvas on narrow screens.
 *
 * Groups (e.g. Administration) render as an inline accordion when expanded, and
 * as a hover/click flyout when collapsed to the rail so their children stay
 * reachable. Visibility here is cosmetic — the API remains the authority on what
 * each role may actually reach.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, type LucideIcon } from 'lucide-react';

export type NavLink = { href: string; label: string; cap?: string; icon?: LucideIcon };
export type NavGroup = { label: string; items: NavLink[]; icon?: LucideIcon };
export type NavItem = NavLink | NavGroup;

export function isNavGroup(item: NavItem): item is NavGroup {
  return 'items' in item;
}

/** Active while the route is (or is under) `href`. Portal roots match exactly. */
function makeIsActive(pathname: string) {
  return (href: string) =>
    href === '/admin' || href === '/lab'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  nav,
  sectionLabel,
  collapsed,
  mobileOpen,
  onClose,
}: {
  nav: NavItem[];
  sectionLabel: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const isActive = makeIsActive(pathname);

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={onClose} aria-hidden />
      )}
      <aside
        className={[
          'sidebar',
          collapsed ? 'is-collapsed' : '',
          mobileOpen ? 'is-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Primary"
      >
        <nav className="sidebar__nav">
          <div className="sidebar__section-label">{sectionLabel}</div>
          {nav.map((item) =>
            isNavGroup(item) ? (
              <SidebarGroup
                key={item.label}
                group={item}
                collapsed={collapsed}
                isActive={isActive}
              />
            ) : (
              <SidebarLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                active={isActive(item.href)}
              />
            ),
          )}
        </nav>
      </aside>
    </>
  );
}

function SidebarLink({
  item,
  collapsed,
  active,
}: {
  item: NavLink;
  collapsed: boolean;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`sidebar__link${active ? ' active' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      {Icon && <Icon size={18} className="sidebar__icon" aria-hidden />}
      <span className="sidebar__label">{item.label}</span>
    </Link>
  );
}

function SidebarGroup({
  group,
  collapsed,
  isActive,
}: {
  group: NavGroup;
  collapsed: boolean;
  isActive: (href: string) => boolean;
}) {
  const pathname = usePathname();
  const groupActive = group.items.some((it) => isActive(it.href));
  const [open, setOpen] = useState(groupActive);
  const [flyout, setFlyout] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Icon = group.icon;

  // Keep the accordion open whenever a child route is active.
  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  // Collapsed rail: the flyout behaves like the old header dropdown — close on
  // outside click, Escape, or navigation.
  useEffect(() => {
    if (!flyout) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setFlyout(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFlyout(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [flyout]);

  useEffect(() => {
    setFlyout(false);
  }, [pathname]);

  if (collapsed) {
    return (
      <div className="sidebar__group" ref={ref}>
        <button
          type="button"
          className={`sidebar__link sidebar__grouptrigger${groupActive ? ' active' : ''}`}
          title={group.label}
          onClick={() => setFlyout((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={flyout}
        >
          {Icon && <Icon size={18} className="sidebar__icon" aria-hidden />}
          <span className="sidebar__label">{group.label}</span>
        </button>
        {flyout && (
          <div className="sidebar__flyout" role="menu">
            <div className="sidebar__flyout-title">{group.label}</div>
            {group.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                className={isActive(it.href) ? 'active' : ''}
              >
                {it.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sidebar__group">
      <button
        type="button"
        className={`sidebar__link sidebar__grouptrigger${groupActive ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {Icon && <Icon size={18} className="sidebar__icon" aria-hidden />}
        <span className="sidebar__label">{group.label}</span>
        <ChevronDown size={15} className="sidebar__chevron" aria-hidden />
      </button>
      {open && (
        <div className="sidebar__sublist">
          {group.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`sidebar__sublink${isActive(it.href) ? ' active' : ''}`}
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
