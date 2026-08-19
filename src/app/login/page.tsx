import { resolveCurrentHospital } from '@/tenants';

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const hospital = await resolveCurrentHospital();

  if (!hospital) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Hospital not found</h1>
          <p>
            This address doesn&apos;t match a registered hospital. Double-check the link your
            hospital gave you, or contact them directly.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        {hospital.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hospital.logoUrl} alt={hospital.name} className="auth-card-logo" />
        )}
        <h1>{hospital.name}</h1>
        <p>Sign in to continue.</p>

        {searchParams.error && <p className="alert alert-error">Invalid email or password.</p>}

        <form action="/login/submit" method="post" className="stacked-form">
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
