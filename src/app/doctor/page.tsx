import Link from 'next/link';

import type { Gender, VisitStatus } from '@prisma/client';

import { listLowStockMedicines } from '@/inventory';
import { calculateAge, searchPatients } from '@/patients';
import { getISTDayBoundsUTC, requireSession, withHospitalContext } from '@/shared';
import { listVisitsForDoctor } from '@/visits';

import { FlashMessage } from '@/app/components/FlashMessage';
import { StatusBadge } from '@/app/components/StatusBadge';

import { startNextWaitingAction } from './actions';

// FR-4.6-FR-4.12: the doctor's post-login home screen -- today's (IST)
// queue with token/age/gender/status per patient, summary counts, a
// one-click "start next waiting patient" action, a search reaching beyond
// today's queue, and completed visits retained (de-emphasized) rather than
// disappearing. Hospital branding + the doctor's name/department (FR-4.12)
// are shown in the shared nav header (src/app/layout.tsx), not duplicated
// here.
export default async function DoctorQueuePage({
  searchParams,
}: {
  searchParams: { q?: string; success?: string; error?: string };
}) {
  const { hospitalId, actorId: doctorId } = await requireSession(['DOCTOR']);
  const query = searchParams.q?.trim() ?? '';
  const { start, end } = getISTDayBoundsUTC();

  const { visits, lowStock, searchResults } = await withHospitalContext(hospitalId, async (tx) => {
    const visits = await listVisitsForDoctor(tx, {
      hospitalId,
      doctorId,
      statuses: ['WAITING', 'IN_CONSULTATION', 'COMPLETED'],
      visitDateFrom: start,
      visitDateTo: end,
    });
    const lowStock = await listLowStockMedicines(tx, hospitalId);
    const searchResults = query ? await searchPatients(tx, { hospitalId, query }) : [];
    return { visits, lowStock, searchResults };
  });

  const waiting = visits.filter((visit) => visit.status === 'WAITING');
  const inConsultation = visits.filter((visit) => visit.status === 'IN_CONSULTATION');
  const completed = visits.filter((visit) => visit.status === 'COMPLETED');

  return (
    <main>
      <h1>Doctor Queue</h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      {/* FR-6.8: low-stock alerts must be visible to the doctor when
          prescribing, not just pharmacy staff. */}
      {lowStock.length > 0 && (
        <p className="alert alert-warning">
          <strong>Low stock, prescribe alternatives if possible:</strong>{' '}
          {lowStock.map((m) => m.name).join(', ')}
        </p>
      )}

      <section>
        <h2>Today&apos;s summary</h2>
        <dl>
          <dt>Waiting</dt>
          <dd>{waiting.length}</dd>
          <dt>In consultation</dt>
          <dd>{inConsultation.length}</dd>
          <dt>Completed</dt>
          <dd>{completed.length}</dd>
          <dt>Total</dt>
          <dd>{visits.length}</dd>
        </dl>

        {waiting.length > 0 && (
          <form action={startNextWaitingAction}>
            <button type="submit">Start next waiting patient</button>
          </form>
        )}
      </section>

      <section>
        <h2>Find a patient</h2>
        <p>Look up any patient by name, ID, or phone — including walk-ins or past patients not in today&apos;s queue.</p>
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
                  <td colSpan={4}>No matches.</td>
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
                    <Link href={`/patients/${patient.id}`}>View record</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>In consultation</h2>
        <p>Visits you&apos;ve already opened and can resume.</p>
        <VisitList visits={inConsultation} emptyLabel="None in progress." />
      </section>

      <section>
        <h2>Waiting</h2>
        <VisitList visits={waiting} emptyLabel="No patients waiting." />
      </section>

      <section>
        <h2>Completed today</h2>
        <p>Retained here for the day so you can reopen one if needed.</p>
        <VisitList visits={completed} emptyLabel="None completed yet." muted />
      </section>
    </main>
  );
}

function VisitList({
  visits,
  emptyLabel,
  muted = false,
}: {
  visits: {
    id: string;
    status: VisitStatus;
    tokenNumber: number | null;
    department: string | null;
    visitDate: Date;
    patient: {
      patientCode: string;
      firstName: string;
      lastName: string;
      dateOfBirth: Date;
      gender: Gender;
    };
  }[];
  emptyLabel: string;
  muted?: boolean;
}) {
  if (visits.length === 0) {
    return <p>{emptyLabel}</p>;
  }

  return (
    <table className={muted ? 'muted-section' : undefined}>
      <thead>
        <tr>
          <th>Token #</th>
          <th>Patient</th>
          <th>Age</th>
          <th>Gender</th>
          <th>Department</th>
          <th>Since</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {visits.map((visit) => (
          <tr key={visit.id}>
            <td>{visit.tokenNumber ?? '—'}</td>
            <td>
              {visit.patient.firstName} {visit.patient.lastName} ({visit.patient.patientCode})
            </td>
            <td>{calculateAge(visit.patient.dateOfBirth)}</td>
            <td>{visit.patient.gender}</td>
            <td>{visit.department ?? '—'}</td>
            <td>{visit.visitDate.toLocaleString()}</td>
            <td>
              <StatusBadge status={visit.status} />
            </td>
            <td>
              <Link href={`/doctor/visits/${visit.id}`}>Open</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
