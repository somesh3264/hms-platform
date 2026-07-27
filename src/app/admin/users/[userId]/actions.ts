'use server';

import { revalidatePath } from 'next/cache';

import type { UserRole } from '@prisma/client';

import { requireSession, withHospitalContext } from '@/shared';
import { resetUserPassword, updateUser } from '@/users';

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

export async function updateUserAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['HOSPITAL_ADMIN']);

  const userId = optionalString(formData, 'userId');
  const name = optionalString(formData, 'name');
  const email = optionalString(formData, 'email');
  const role = formData.get('role');
  if (!userId || !name || !email || typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role as UserRole)) {
    throw new Error('Name, email, and a valid role are required.');
  }

  // A disabled checkbox (rendered when editing your own account, see
  // src/app/admin/users/[userId]/page.tsx) never submits its value, so
  // "isActive" would otherwise read as false here for a self-edit -- force
  // true instead, matching what the disabled control visually shows.
  const isSelf = userId === actorId;
  const isActive = isSelf ? true : formData.get('isActive') === 'on';

  await withHospitalContext(hospitalId, (tx) =>
    updateUser(tx, {
      hospitalId,
      actorId,
      userId,
      name,
      email,
      role: role as UserRole,
      department: optionalString(formData, 'department'),
      isActive,
    }),
  );

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['HOSPITAL_ADMIN']);

  const userId = optionalString(formData, 'userId');
  const newPassword = optionalString(formData, 'newPassword');
  if (!userId || !newPassword) {
    throw new Error('A new password is required.');
  }

  await withHospitalContext(hospitalId, (tx) =>
    resetUserPassword(tx, { hospitalId, actorId, userId, newPassword }),
  );

  revalidatePath(`/admin/users/${userId}`);
}
