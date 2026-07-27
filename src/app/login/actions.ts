'use server';

import { redirect } from 'next/navigation';

import { createSession, ROLE_HOME, withHospitalContext } from '@/shared';
import { authenticateUser } from '@/users';

export async function loginAction(formData: FormData): Promise<void> {
  const hospitalId = formData.get('hospitalId');
  const email = formData.get('email');
  const password = formData.get('password');

  if (
    typeof hospitalId !== 'string' ||
    !hospitalId ||
    typeof email !== 'string' ||
    !email ||
    typeof password !== 'string' ||
    !password
  ) {
    redirect('/login?error=1');
  }

  const user = await withHospitalContext(hospitalId, (tx) =>
    authenticateUser(tx, { hospitalId, email, password }),
  );

  if (!user) {
    redirect('/login?error=1');
  }

  await createSession({ id: user.id, hospitalId, role: user.role, name: user.name });
  redirect(ROLE_HOME[user.role]);
}
