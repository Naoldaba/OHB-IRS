import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'OHB Laboratory Reporting System',
  description:
    'Oromia Health Bureau — centralized laboratory reporting and monitoring.',
};

// Runs before first paint: resolves the theme (explicit choice, else OS
// preference) and sets it on <html> so there is no flash of the wrong theme.
const THEME_INIT = `(function(){try{var s=localStorage.getItem('ohb-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',(s==='dark'||(!s&&m))?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
