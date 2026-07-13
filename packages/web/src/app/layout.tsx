import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'Nakalchi — Reports',
  description: 'Plagiarism detection analysis reports',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            padding: '0.75rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <Link href="/" style={{ color: 'var(--text)', fontWeight: 700, fontSize: '1rem' }}>
            Nakalchi Reports
          </Link>
        </header>
        <main style={{ padding: '1.25rem', maxWidth: 1400, margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
