import { resolveCurrentHospital } from '@/tenants';

import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const hospital = await resolveCurrentHospital();

  return (
    <main className="auth-page">
      <div className="auth-card">
        {hospital.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hospital.logoUrl} alt={hospital.name} className="auth-card-logo" />
        )}
        <h1>{hospital.name}</h1>
        <p>Sign in to continue.</p>

        {searchParams.error && (
          <p className="alert alert-error">Invalid email or password.</p>
        )}

        <form action={loginAction} className="stacked-form">
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
