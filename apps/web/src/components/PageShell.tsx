'use client';

/**
 * The authenticated app frame: thin utility strip, a full-width header (brand +
 * search + user), a collapsible left sidebar for navigation, the content area,
 * and footer. The sidebar collapses to an icon rail on desktop (choice persisted)
 * and slides in off-canvas on narrow screens. The nav only reflects the user's
 * role — the API remains the authority on what each role may actually do.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Menu,
  LayoutGrid,
  BarChart3,
  FileText,
  CalendarDays,
  ListChecks,
  Inbox,
  ScrollText,
  Settings,
  Building2,
  Users,
} from 'lucide-react';
import { ROLE_META } from '@ohb/shared';
import { useAuth } from '@/lib/auth';
import { GlobalSearch } from './GlobalSearch';
import { Sidebar, isNavGroup, type NavItem } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import { Avatar, BrandMark } from './ui';
import type { ReactNode } from 'react';

// `cap`-tagged items appear only when the signed-in role holds that capability
// (Phase 28b). Untagged items are always shown to the portal's scope. Visibility
// here is cosmetic — the API independently authorizes every call.
const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutGrid },
  { href: '/admin/analytics', label: 'Dashboard', cap: 'view_bureau_analytics', icon: BarChart3 },
  { href: '/admin/report-types', label: 'Reports', icon: FileText },
  { href: '/admin/periods', label: 'Periods', cap: 'manage_periods', icon: CalendarDays },
  { href: '/admin/requirements', label: 'Requirements', cap: 'manage_requirements', icon: ListChecks },
  { href: '/admin/submissions', label: 'Submissions', icon: Inbox },
  { href: '/admin/audit', label: 'Audit', cap: 'view_audit', icon: ScrollText },
  {
    label: 'Administration',
    icon: Settings,
    items: [
      { href: '/admin/labs', label: 'Labs', cap: 'manage_laboratories' },
      { href: '/admin/users', label: 'Users', cap: 'manage_users' },
      { href: '/admin/roles', label: 'Permissions', cap: 'manage_roles' },
    ],
  },
];

const LAB_NAV: NavItem[] = [{ href: '/lab', label: 'My reports', icon: FileText }];

export function PageShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, can } = useAuth();
  const pathname = usePathname();

  // Desktop: collapse to an icon rail (persisted). Narrow: slide-in drawer.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('ohb-sidebar') === 'collapsed') setCollapsed(true);
    } catch {
      /* private mode / blocked storage — keep the default */
    }
  }, []);

  // A single control: open the drawer on narrow screens, toggle the rail otherwise.
  function toggleSidebar() {
    const narrow =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 860px)').matches;
    if (narrow) {
      setMobileOpen((v) => !v);
      return;
    }
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('ohb-sidebar', next ? 'collapsed' : 'expanded');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Close the off-canvas drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const visible = (item: { cap?: string }) => !item.cap || can(item.cap);
  const nav: NavItem[] = (isAdmin ? ADMIN_NAV : LAB_NAV)
    .map((item) =>
      isNavGroup(item) ? { ...item, items: item.items.filter(visible) } : item,
    )
    .filter((item) => (isNavGroup(item) ? item.items.length > 0 : visible(item)));

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
          <button
            type="button"
            className="app-header__menu"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
          >
            <Menu size={20} />
          </button>

          <Link href={isAdmin ? '/admin' : '/lab'} className="brand" style={{ textDecoration: 'none' }}>
            <BrandMark size={40} />
            <span className="brand__text">
              <span className="brand__en">Oromia Health Bureau</span><br></br>
              <span className="brand__om">Biiroo Eegumsa Fayyaa Oromiyaa</span>
            </span>
          </Link>

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
              <Avatar
                name={user?.fullName ?? ''}
                src={user?.avatarUrl}
                size={34}
                online={user?.showOnlineStatus}
              />
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

      <div className="app-body">
        <Sidebar
          nav={nav}
          sectionLabel={isAdmin ? 'Regional Operations' : 'My Laboratory'}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />

        <div className="app-main">
          <main className="page">{children}</main>

          <footer className="app-footer">
            <div className="app-footer__inner">
              <span>Oromia Health Bureau — Laboratory Reporting &amp; Monitoring System</span>
              <span>© Naol Daba. All Rights Reserved.</span>
              <span>Support: support@ohb.local · +251 11 000 0000 · Finfinne, Oromia</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
