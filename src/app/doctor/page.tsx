import Link from 'next/link';

import { listLowStockMedicines } from '@/inventory';
import { withHospitalContext } from '@/shared';
import { getDevDoctorSession } from '@/shared/dev-session';
import { listVisitsForDoctor } from '@/visits';

export default async function DoctorQueuePage() {
  const { hospitalId, actorId: doctorId } = await getDevDoctorSession();

  const { visits, lowStock } = await withHospitalContext(hospitalId, async (tx) => {
    const visits = await listVisitsForDoctor(tx, {
      hospitalId,
      doctorId,
      statuses: ['WAITING', 'IN_CONSULTATION'],
    });
    const lowStock = await listLowStockMedicines(tx, hospitalId);
    return { visits, lowStock };
  });

  const waiting = visits.filter((visit) => visit.status === 'WAITING');
  const inConsultation = visits.filter((visit) => visit.status === 'IN_CONSULTATION');

  return (
    <main>
      <h1>Doctor Queue</h1>

      {/* FR-6.8: low-stock alerts must be visible to the doctor when
          prescribing, not just pharmacy staff. */}
      {lowStock.length > 0 && (
        <p>
          <strong>Low stock, prescribe alternatives if possible:</strong>{' '}
          {lowStock.map((m) => m.name).join(', ')}
        </p>
      )}

      <section>
        <h2>In consultation</h2>
        <p>Visits you&apos;ve already opened and can resume.</p>
        <VisitList visits={inConsultation} emptyLabel="None in progress." />
      </section>

      <section>
        <h2>Waiting</h2>
        <VisitList visits={waiting} emptyLabel="No patients waiting." />
      </section>
    </main>
  );
}

function VisitList({
  visits,
  emptyLabel,
}: {
  visits: {
    id: string;
    department: string | null;
    visitDate: Date;
    patient: { patientCode: string; firstName: string; lastName: string };
  }[];
  emptyLabel: string;
}) {
  if (visits.length === 0) {
    return <p>{emptyLabel}</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Patient</th>
          <th>Department</th>
          <th>Since</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {visits.map((visit) => (
          <tr key={visit.id}>
            <td>
              {visit.patient.firstName} {visit.patient.lastName} ({visit.patient.patientCode})
            </td>
            <td>{visit.department ?? '—'}</td>
            <td>{visit.visitDate.toLocaleString()}</td>
            <td>
              <Link href={`/doctor/visits/${visit.id}`}>Open</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
