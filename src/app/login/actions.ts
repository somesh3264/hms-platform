'use server';

import { redirect } from 'next/navigation';

import { createSession, ROLE_HOME, withHospitalContext } from '@/shared';
import { resolveCurrentHospitalId } from '@/tenants';
import { authenticateUser } from '@/users';

export async function loginAction(formData: FormData): Promise<void> {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
    redirect('/login?error=1');
  }

  const hospitalId = await resolveCurrentHospitalId();
  if (!hospitalId) {
    redirect('/login?error=1');
  }

  const user = await withHospitalContext(hospitalId, (tx) =>
    authenticateUser(tx, { hospitalId, email, password }),
  );

  if (!user) {
    redirect('/login?error=1');
  }

  await createSession({
    id: user.id,
    hospitalId,
    role: user.role,
    name: user.name,
    department: user.department ?? undefined,
  });
  redirect(ROLE_HOME[user.role]);
}
