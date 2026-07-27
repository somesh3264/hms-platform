'use server';

import { revalidatePath } from 'next/cache';

import type { UserRole } from '@prisma/client';

import { requireSession, withHospitalContext } from '@/shared';
import { createUser } from '@/users';

const ASSIGNABLE_ROLES: UserRole[] = [
  'HOSPITAL_ADMIN',
  'FRONT_DESK',
  'DOCTOR',
  'PHARMACIST',
  'BILLING_STAFF',
];

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export async function createUserAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['HOSPITAL_ADMIN']);

  const name = optionalString(formData, 'name');
  const email = optionalString(formData, 'email');
  const password = optionalString(formData, 'password');
  const role = formData.get('role');
  if (!name || !email || !password || typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role as UserRole)) {
    throw new Error('Name, email, password, and a valid role are required.');
  }

  await withHospitalContext(hospitalId, (tx) =>
    createUser(tx, {
      hospitalId,
      actorId,
      name,
      email,
      password,
      role: role as UserRole,
      department: optionalString(formData, 'department'),
    }),
  );

  revalidatePath('/admin/users');
}
