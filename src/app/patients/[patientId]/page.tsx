import Link from 'next/link';

import { getPatientHistory } from '@/patients';
import { requireSession, withHospitalContext } from '@/shared';

import { StatusBadge } from '@/app/components/StatusBadge';

// FR-8.1/FR-8.2: a single consolidated view of a patient's visits,
// prescriptions, and bills, with links to open any past prescription scan
// or bill. Open to any authenticated staff role.
export default async function PatientRecordPage({ params }: { params: { patientId: string } }) {
  const { hospitalId } = await requireSession();

  const { patient, visits } = await withHospitalContext(hospitalId, (tx) =>
    getPatientHistory(tx, { hospitalId, patientId: params.patientId }),
  );

  return (
    <main>
      <h1>
        {patient.name} ({patient.patientCode})
      </h1>

      <section>
        <h2>Demographics</h2>
        <dl>
          <dt>Age</dt>
          <dd>{patient.age}</dd>
          <dt>Gender</dt>
          <dd>{patient.gender}</dd>
          <dt>Phone</dt>
          <dd>{patient.phone ?? '—'}</dd>
          <dt>Address</dt>
          <dd>{patient.address ?? '—'}</dd>
        </dl>
      </section>

      <section>
        <h2>Visit history</h2>
        {visits.length === 0 ? (
          <p>No visits yet.</p>
        ) : (
          visits.map((visit) => (
            <article key={visit.id}>
              <h3>
                {visit.visitDate.toLocaleDateString()} — {visit.doctor.name}{' '}
                <StatusBadge status={visit.status} />
              </h3>
              {visit.consultationNotes && <p>Notes: {visit.consultationNotes}</p>}

              <h4>Prescriptions</h4>
              {visit.prescriptions.length === 0 ? (
                <p>None.</p>
              ) : (
                <ul>
                  {visit.prescriptions.map((prescription) => (
                    <li key={prescription.id}>
                      {prescription.createdAt.toLocaleDateString()} —{' '}
                      <StatusBadge status={prescription.status} /> —{' '}
                      <a href={prescription.fileUrl} target="_blank" rel="noreferrer">
                        View scan
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <h4>Bills</h4>
              {visit.bills.length === 0 ? (
                <p>None.</p>
              ) : (
                <ul>
                  {visit.bills.map((bill) => (
                    <li key={bill.id}>
                      {bill.billNumber} — ₹{(bill.totalCents / 100).toFixed(2)} —{' '}
                      <StatusBadge status={bill.paymentStatus} /> —{' '}
                      <Link href={`/billing/${bill.id}`}>View bill</Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
