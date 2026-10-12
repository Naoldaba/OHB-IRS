'use client';

/**
 * The authenticated app frame: thin utility strip, brand + role-aware nav,
 * content area, and footer. Mirrors the mockup's structure so every page
 * inherits the look. The nav only reflects the user's role — the API remains
 * the authority on what each role may actually do.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { ROLE_META } from '@ohb/shared';
import { useAuth } from '@/lib/auth';
import { GlobalSearch } from './GlobalSearch';
import { NavMenu, type NavLink } from './NavMenu';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import { Avatar, BrandMark } from './ui';
import type { ReactNode } from 'react';

type NavGroup = { label: string; items: NavLink[] };
type NavItem = NavLink | NavGroup;

// `cap`-tagged items appear only when the signed-in role holds that capability
// (Phase 28b). Untagged items are always shown to the portal's scope. Visibility
// here is cosmetic — the API independently authorizes every call.
const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/analytics', label: 'Dashboard', cap: 'view_bureau_analytics' },
  { href: '/admin/report-types', label: 'Reports' },
  { href: '/admin/periods', label: 'Periods', cap: 'manage_periods' },
  { href: '/admin/requirements', label: 'Requirements', cap: 'manage_requirements' },
  { href: '/admin/submissions', label: 'Submissions' },
  { href: '/admin/audit', label: 'Audit', cap: 'view_audit' },
  {
    label: 'Administration',
    items: [
      { href: '/admin/labs', label: 'Labs', cap: 'manage_laboratories' },
      { href: '/admin/users', label: 'Users', cap: 'manage_users' },
      { href: '/admin/roles', label: 'Permissions', cap: 'manage_roles' },
    ],
  },
];

const LAB_NAV: NavItem[] = [{ href: '/lab', label: 'My reports' }];

export function PageShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, can } = useAuth();
  const pathname = usePathname();

  const visible = (item: NavLink) => !item.cap || can(item.cap);
  const nav: NavItem[] = (isAdmin ? ADMIN_NAV : LAB_NAV)
    .map((item) =>
      'items' in item ? { ...item, items: item.items.filter(visible) } : item,
    )
    .filter((item) => ('items' in item ? item.items.length > 0 : visible(item)));

  const isActive = (href: string) =>
    href === '/admin' || href === '/lab'
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <div className="app-shell">
      <div className="utility-strip">
        <div className="utility-strip__inner">
          <span className="micro-label">
            {isAdmin ? 'Bureau Administration Console' : 'Regional Laboratory Portal'}
          </span>
          <span className="utility-strip__meta">
            <span>
              <ShieldCheck size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Secure Session
            </span>
            <span>Africa / Addis Ababa</span>
          </span>
        </div>
      </div>

      <header className="app-header">
        <div className="app-header__inner">
          <Link href={isAdmin ? '/admin' : '/lab'} className="brand" style={{ textDecoration: 'none' }}>
            <BrandMark size={40} />
            <span className="brand__text">
              <span className="brand__en">Oromia Health Bureau</span><br></br>
              <span className="brand__om">Biiroo Eegumsa Fayyaa Oromiyaa</span>
            </span>
          </Link>

          <nav className="nav">
            {nav.map((item) =>
              'items' in item ? (
                <NavMenu key={item.label} label={item.label} items={item.items} />
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive(item.href) ? 'active' : ''}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="app-header__spacer" />

          <GlobalSearch />
          <ThemeToggle />
          <NotificationBell />

          <div className="user-chip">
            <Link
              href="/profile"
              className={`user-chip__link${pathname.startsWith('/profile') ? ' active' : ''}`}
              title="Your profile"
            >
              <Avatar name={user?.fullName ?? ''} src={user?.avatarUrl} size={34} />
              <span className="user-chip__text">
                <span className="user-chip__name">{user?.fullName}</span>
                <br />
                <span className="user-chip__role">
                  {user
                    ? (ROLE_META as Record<string, { label: string }>)[user.role]?.label ?? user.role
                    : ''}
                </span>
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="page">{children}</main>

      <footer className="app-footer">
        <div className="app-footer__inner">
          <span>Oromia Health Bureau — Laboratory Reporting &amp; Monitoring System</span>
          <span>© Naol Daba. All Rights Reserved.</span>
          <span>Support: support@ohb.local · +251 11 000 0000 · Finfinne, Oromia</span>
        </div>
      </footer>
    </div>
  );
}
