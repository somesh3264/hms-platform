import type { Metadata } from 'next';
import Link from 'next/link';

import type { UserRole } from '@prisma/client';

import { getSession, prisma } from '@/shared';

import { logoutAction } from './logout/actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'HMS Platform',
  description: 'Multi-tenant hospital management system',
};

const ROLE_LINKS: Record<UserRole, { href: string; label: string }[]> = {
  SUPER_ADMIN: [],
  HOSPITAL_ADMIN: [
    { href: '/admin/hospital', label: 'Hospital Settings' },
    { href: '/admin/users', label: 'Manage Users' },
  ],
  FRONT_DESK: [{ href: '/front-desk', label: 'Front Desk' }],
  DOCTOR: [{ href: '/doctor', label: 'Doctor Queue' }],
  PHARMACIST: [
    { href: '/pharmacy', label: 'Pharmacy Queue' },
    { href: '/pharmacy/inventory', label: 'Inventory' },
  ],
  BILLING_STAFF: [{ href: '/billing', label: 'Billing' }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const hospital = session
    ? await prisma.hospital.findUnique({
        where: { id: session.hospitalId },
        select: { name: true, logoUrl: true },
      })
    : null;

  return (
    <html lang="en">
      <body>
        {session && (
          <header className="app-header">
            <div className="app-header-brand">
              {hospital?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hospital.logoUrl} alt={hospital.name} className="app-header-logo" />
              )}
              <span>{hospital?.name ?? 'HMS Platform'}</span>
            </div>

            <nav className="app-nav">
              {[...ROLE_LINKS[session.role], { href: '/patients', label: 'Patients' }].map(
                (link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ),
              )}
            </nav>

            <div className="app-header-user">
              <span>
                {session.name} ({session.role.replace('_', ' ')}
                {session.department ? ` — ${session.department}` : ''})
              </span>
              <form action={logoutAction}>
                <button type="submit">Log out</button>
              </form>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
