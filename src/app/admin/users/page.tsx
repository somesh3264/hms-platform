import Link from 'next/link';

import { requireSession, withHospitalContext } from '@/shared';
import { listUsers } from '@/users';

import { createUserAction } from './actions';

const ASSIGNABLE_ROLES = [
  'HOSPITAL_ADMIN',
  'FRONT_DESK',
  'DOCTOR',
  'PHARMACIST',
  'BILLING_STAFF',
] as const;

// FR-2.2: Hospital Admin creating/editing/deactivating staff accounts within
// their own hospital. SUPER_ADMIN is deliberately excluded from the
// assignable roles -- that's a platform-level role, not one a Hospital
// Admin should be able to grant.
export default async function UsersPage() {
  const { hospitalId } = await requireSession(['HOSPITAL_ADMIN']);

  const users = await withHospitalContext(hospitalId, (tx) => listUsers(tx, hospitalId));

  return (
    <main>
      <h1>Manage Users</h1>

      <section>
        <h2>Staff accounts</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role.replace('_', ' ')}</td>
                <td>{user.department ?? '—'}</td>
                <td>{user.isActive ? 'Active' : 'Deactivated'}</td>
                <td>
                  <Link href={`/admin/users/${user.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Add a new user</h2>
        <form action={createUserAction} className="stacked-form">
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Password
            <input type="password" name="password" required minLength={8} />
          </label>
          <label>
            Role
            <select name="role" required defaultValue="">
              <option value="" disabled>
                Select a role…
              </option>
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Department (optional)
            <input type="text" name="department" />
          </label>
          <button type="submit">Create user</button>
        </form>
      </section>
    </main>
  );
}
