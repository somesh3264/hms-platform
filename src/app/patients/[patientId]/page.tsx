import Link from 'next/link';

import { getPatientHistory } from '@/patients';
import { formatISTDate, requireSession, withHospitalContext } from '@/shared';
import { getVisitDoctorLabel } from '@/visits';

import { StatusBadge } from '@/app/components/StatusBadge';

// FR-8.1/FR-8.2: a single consolidated view of a patient's visits,
// prescriptions, and bills, with links to open any past prescription scan
// or bill. Open to any authenticated staff role.
export default async function PatientRecordPage({ params }: { params: { patientId: string } }) {
  const { hospitalId, role } = await requireSession();

  const { patient, visits, otherBills } = await withHospitalContext(hospitalId, (tx) =>
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
        {/* FRONT_DESK owns patient registration/demographics -- editing is
            scoped to that role (a later, explicitly requested addition),
            unlike this longitudinal view itself, which stays open to any
            authenticated role. */}
        {role === 'FRONT_DESK' && (
          <Link href={`/front-desk/patients/${patient.id}/edit`}>Edit</Link>
        )}
      </section>

      <section>
        <h2>Visit history</h2>
        {visits.length === 0 ? (
          <p>No visits yet.</p>
        ) : (
          visits.map((visit) => (
            <article key={visit.id}>
              <h3>
                {formatISTDate(visit.visitDate)} — {getVisitDoctorLabel(visit)}{' '}
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
                      {formatISTDate(prescription.createdAt)} —{' '}
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

      {/* Counter Sale bills (src/billing/counter-sale.ts) -- a walk-in
          medicine purchase with no doctor consultation, so there's no
          Visit for it to show up under above. Only rendered when there are
          any, so a patient who's never had a counter sale sees no change
          to this page at all. */}
      {otherBills.length > 0 && (
        <section>
          <h2>Other bills</h2>
          <p>Medicine purchased directly at the counter, not tied to a doctor visit.</p>
          <ul>
            {otherBills.map((bill) => (
              <li key={bill.id}>
                {bill.billNumber} — ₹{(bill.totalCents / 100).toFixed(2)} —{' '}
                <StatusBadge status={bill.paymentStatus} /> —{' '}
                <Link href={`/billing/${bill.id}`}>View bill</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
