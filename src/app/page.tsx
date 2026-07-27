import { redirect } from 'next/navigation';

import { getSession, ROLE_HOME } from '@/shared';

export default async function HomePage() {
  const session = await getSession();
  redirect(session ? ROLE_HOME[session.role] : '/login');
}
