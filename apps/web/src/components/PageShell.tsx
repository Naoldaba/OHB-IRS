'use client';

/**
 * The authenticated app frame: thin utility strip, brand + role-aware nav,
 * content area, and footer. Mirrors the mockup's structure so every page
 * inherits the look. The nav only reflects the user's role — the API remains
 * the authority on what each role may actually do.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, LogOut, ShieldCheck } from 'lucide-react';
import { RoleName } from '@ohb/shared';
import { useAuth } from '@/lib/auth';
import { NotificationBell } from './NotificationBell';
import { Avatar } from './ui';
import type { ReactNode } from 'react';

const ADMIN_NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/analytics', label: 'Dashboard' },
  { href: '/admin/report-types', label: 'Reports' },
  { href: '/admin/periods', label: 'Periods' },
  { href: '/admin/submissions', label: 'Submissions' },
  { href: '/admin/labs', label: 'Labs' },
  { href: '/admin/users', label: 'Users' },
];

const LAB_NAV = [{ href: '/lab', label: 'My reports' }];

export function PageShell({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const nav = isAdmin ? ADMIN_NAV : LAB_NAV;

  const isActive = (href: string) =>
    href === '/admin' || href === '/lab'
      ? pathname === href
      : pathname.startsWith(href);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

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
            <span className="brand__mark">
              <Activity size={22} />
            </span>
            <span className="brand__text">
              <span className="brand__en">Oromia Health Bureau</span><br></br>
              <span className="brand__om">Biiroo Eegumsa Fayyaa Oromiyaa</span>
            </span>
          </Link>

          <nav className="nav">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? 'active' : ''}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="app-header__spacer" />

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
                  {user?.role === RoleName.BUREAU_ADMIN ? 'Bureau Admin' : 'Lab Head'}
                </span>
              </span>
            </Link>
            <button
              className="btn btn--ghost btn--sm"
              onClick={handleLogout}
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
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
