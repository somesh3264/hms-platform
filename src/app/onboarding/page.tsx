import { FlashMessage } from '@/app/components/FlashMessage';

import { onboardHospitalAction } from './actions';

// FR-1.1/FR-1.6's minimal onboarding surface for the shared-platform model:
// creates a new Hospital + its first Hospital Admin. Deliberately not built
// as a SUPER_ADMIN-gated screen -- User.hospitalId is required by every
// tenant-owned table's RLS policy, so a genuinely platform-level (no single
// hospital) login identity would need its own schema/RLS carve-out, well
// beyond "minimal." Gated instead by a shared secret (PLATFORM_ADMIN_SECRET)
// entered directly in the form, the same env-var-provisioned-credential
// shape as the Phase 01 bootstrap admin. Not linked from any nav -- reachable
// only by typing the URL. Known limitation, same category as the
// already-flagged missing login rate-limiting: nothing throttles repeated
// guesses at the secret here either.
export default function OnboardingPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string; sid?: string };
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Onboard a hospital</h1>
        <p>Creates a new hospital and its first Hospital Admin account.</p>

        <FlashMessage success={searchParams.success} error={searchParams.error} />

        <form
          key={searchParams.sid ?? 'idle'}
          action={onboardHospitalAction}
          className="stacked-form"
        >
          <label>
            Platform admin secret
            <input type="password" name="secret" required autoComplete="off" />
          </label>
          <label>
            Hospital name
            <input type="text" name="hospitalName" required />
          </label>
          <label>
            Subdomain
            <input
              type="text"
              name="subdomain"
              required
              pattern="[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?"
              placeholder="e.g. apollo"
            />
          </label>
          <label>
            Admin name
            <input type="text" name="adminName" required />
          </label>
          <label>
            Admin email
            <input type="email" name="adminEmail" required autoComplete="off" />
          </label>
          <label>
            Admin password
            <input
              type="password"
              name="adminPassword"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <button type="submit">Create hospital</button>
        </form>
      </div>
    </main>
  );
}
