import { prisma } from '@/shared';

import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const hospitals = await prisma.hospital.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>HMS Platform</h1>
        <p>Sign in to continue.</p>

        {searchParams.error && (
          <p className="alert alert-error">Invalid hospital, email, or password.</p>
        )}

        <form action={loginAction} className="stacked-form">
          <label>
            Hospital
            <select name="hospitalId" required defaultValue="">
              <option value="" disabled>
                Select your hospital…
              </option>
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Email
            <input type="email" name="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </div>
    </main>
  );
}
