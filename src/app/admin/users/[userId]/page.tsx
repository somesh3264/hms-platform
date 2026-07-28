import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';

import { resetPasswordAction, updateUserAction } from './actions';

const ASSIGNABLE_ROLES = [
  'HOSPITAL_ADMIN',
  'FRONT_DESK',
  'DOCTOR',
  'PHARMACIST',
  'BILLING_STAFF',
] as const;

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams: { success?: string; error?: string };
}) {
  const { hospitalId, actorId } = await requireSession(['HOSPITAL_ADMIN']);

  const user = await withHospitalContext(hospitalId, (tx) =>
    tx.user.findFirstOrThrow({ where: { id: params.userId, hospitalId } }),
  );

  const isSelf = user.id === actorId;

  return (
    <main>
      <h1>Edit user</h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section className="form-narrow">
        <form action={updateUserAction} className="stacked-form">
          <input type="hidden" name="userId" value={user.id} />
          <label>
            Name
            <input type="text" name="name" defaultValue={user.name} required />
          </label>
          <label>
            Email
            <input type="email" name="email" defaultValue={user.email} required />
          </label>
          <label>
            Role
            <select name="role" required defaultValue={user.role}>
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Department (optional)
            <input type="text" name="department" defaultValue={user.department ?? ''} />
          </label>
          <label>
            <input type="checkbox" name="isActive" defaultChecked={user.isActive} disabled={isSelf} />
            Active
          </label>
          {isSelf && <p className="alert alert-warning">You cannot deactivate your own account.</p>}
          <button type="submit">Save</button>
        </form>
      </section>

      <section className="form-narrow">
        <h2>Reset password</h2>
        <form action={resetPasswordAction} className="stacked-form">
          <input type="hidden" name="userId" value={user.id} />
          <label>
            New password
            <input type="password" name="newPassword" required minLength={8} />
          </label>
          <button type="submit">Reset password</button>
        </form>
      </section>
    </main>
  );
}
