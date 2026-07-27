import { searchPatients } from '@/patients';
import { requireSession, withHospitalContext } from '@/shared';
import { listWaitingQueue } from '@/visits';

import { createVisitAction, registerPatientAction } from './actions';

export default async function FrontDeskPage({ searchParams }: { searchParams: { q?: string } }) {
  const { hospitalId } = await requireSession(['FRONT_DESK']);
  const query = searchParams.q?.trim() ?? '';

  const { searchResults, queue, doctors } = await withHospitalContext(hospitalId, async (tx) => {
    const searchResults = query ? await searchPatients(tx, { hospitalId, query }) : [];
    const queue = await listWaitingQueue(tx, { hospitalId });
    const doctors = await tx.user.findMany({
      where: { hospitalId, role: 'DOCTOR', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { searchResults, queue, doctors };
  });

  return (
    <main>
      <h1>Front Desk</h1>

      <section>
        <h2>Find a patient</h2>
        <p>Search by name, phone, or patient ID before registering a new patient.</p>
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
                <th>Create visit</th>
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
                  <td>
                    {patient.firstName} {patient.lastName}
                  </td>
                  <td>{patient.phone ?? '—'}</td>
                  <td>
                    <form action={createVisitAction}>
                      <input type="hidden" name="patientId" value={patient.id} />
                      <select name="doctorId" required>
                        <option value="">Assign doctor…</option>
                        {doctors.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {doctor.name}
                          </option>
                        ))}
                      </select>
                      <input type="text" name="department" placeholder="Department (optional)" />
                      <button type="submit">Create visit</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Register new patient</h2>
        <form action={registerPatientAction}>
          <label>
            First name
            <input type="text" name="firstName" required />
          </label>
          <label>
            Last name
            <input type="text" name="lastName" required />
          </label>
          <label>
            Date of birth
            <input type="date" name="dateOfBirth" required />
          </label>
          <label>
            Gender
            <select name="gender" defaultValue="UNKNOWN">
              <option value="UNKNOWN">Unknown</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Phone
            <input type="tel" name="phone" />
          </label>
          <label>
            Email
            <input type="email" name="email" />
          </label>
          <label>
            Address
            <input type="text" name="address" />
          </label>
          <label>
            <input type="checkbox" name="consentDigitalDelivery" />
            Patient consents to digital delivery of bills/prescriptions
          </label>
          <button type="submit">Register patient</button>
        </form>
      </section>

      <section>
        <h2>Waiting queue</h2>
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Department</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 && (
              <tr>
                <td colSpan={4}>No patients waiting.</td>
              </tr>
            )}
            {queue.map((visit) => (
              <tr key={visit.id}>
                <td>
                  {visit.patient.firstName} {visit.patient.lastName} ({visit.patient.patientCode})
                </td>
                <td>{visit.doctor.name}</td>
                <td>{visit.department ?? '—'}</td>
                <td>{visit.visitDate.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
