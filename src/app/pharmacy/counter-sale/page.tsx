import Link from 'next/link';

import { searchPatients } from '@/patients';
import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';

import { registerCounterSaleBuyerAction } from './actions';

// Entry point for a walk-in buying medicine with no doctor consultation
// involved (a later, explicitly requested feature -- see
// src/billing/counter-sale.ts for the full reasoning). Deliberately mirrors
// front-desk's own "find or register a patient" page (src/app/front-desk/
// page.tsx) rather than inventing a different pattern -- same
// searchPatients/registerPatient calls, just handing off to
// /pharmacy/counter-sale/[patientId] to pick medicines next instead of
// creating a Visit.
export default async function CounterSalePage({
  searchParams,
}: {
  searchParams: { q?: string; success?: string; error?: string; sid?: string };
}) {
  const { hospitalId } = await requireSession(['PHARMACIST']);
  const query = searchParams.q?.trim() ?? '';

  const searchResults = await withHospitalContext(hospitalId, (tx) =>
    query ? searchPatients(tx, { hospitalId, query }) : Promise.resolve([]),
  );

  return (
    <main>
      <h1>Counter Sale</h1>
      <p>For a walk-in buying medicine directly, with or without a prescription from elsewhere.</p>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <h2>Find patient</h2>
        <p>Search by name, phone, or patient ID before registering a new one.</p>
        <form method="get">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Name, phone, or patient ID"
          />
          <button type="submit">Search</button>
        </form>

        {query && (
          <table>
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {searchResults.length === 0 && (
                <tr>
                  <td colSpan={4}>No matches. Register this patient below.</td>
                </tr>
              )}
              {searchResults.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.patientCode}</td>
                  <td>{patient.name}</td>
                  <td>{patient.phone ?? '—'}</td>
                  <td>
                    <Link href={`/pharmacy/counter-sale/${patient.id}`}>Sell medicine</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Register new patient</h2>
        <form key={searchParams.sid ?? 'idle'} action={registerCounterSaleBuyerAction}>
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <label>
            Age
            <input type="text" name="age" inputMode="numeric" pattern="[0-9]*" required />
          </label>
          <label>
            Phone
            <input
              type="tel"
              name="phone"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              title="10-digit phone number"
              required
            />
          </label>
          <button type="submit">Register &amp; sell medicine</button>
        </form>
      </section>
    </main>
  );
}
