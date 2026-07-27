'use server';

import { redirect } from 'next/navigation';

import { destroySession } from '@/shared';

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
