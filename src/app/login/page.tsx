import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>HMS Platform</h1>
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
