import Link from 'next/link';

import { searchPatients } from '@/patients';
import { requireSession, withHospitalContext } from '@/shared';

// FR-8.3: search patient records by name, ID, or phone -- the entry point
// into the FR-8.1 longitudinal view at /patients/[patientId]. Open to any
// authenticated staff role ("authorized staff"), not gated to one module.
export default async function PatientsSearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { hospitalId } = await requireSession();
  const query = searchParams.q?.trim() ?? '';

  const results = query
    ? await withHospitalContext(hospitalId, (tx) => searchPatients(tx, { hospitalId, query }))
    : [];

  return (
    <main>
      <h1>Patients</h1>
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
        <section>
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
              {results.length === 0 && (
                <tr>
                  <td colSpan={4}>No matches.</td>
                </tr>
              )}
              {results.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.patientCode}</td>
                  <td>
                    {patient.firstName} {patient.lastName}
                  </td>
                  <td>{patient.phone ?? '—'}</td>
                  <td>
                    <Link href={`/patients/${patient.id}`}>View record</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
