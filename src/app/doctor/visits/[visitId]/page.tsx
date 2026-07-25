import { getPatientHistory } from '@/patients';
import { withHospitalContext } from '@/shared';
import { getDevDoctorSession } from '@/shared/dev-session';
import { getVisitDetail } from '@/visits';

import { saveNotesAction, startConsultationAction } from './actions';

export default async function VisitDetailPage({ params }: { params: { visitId: string } }) {
  const { hospitalId } = await getDevDoctorSession();

  const { visit, history } = await withHospitalContext(hospitalId, async (tx) => {
    const visit = await getVisitDetail(tx, { hospitalId, visitId: params.visitId });
    const history = await getPatientHistory(tx, { hospitalId, patientId: visit.patientId });
    return { visit, history };
  });

  return (
    <main>
      <h1>
        {visit.patient.firstName} {visit.patient.lastName} ({visit.patient.patientCode})
      </h1>

      <section>
        <h2>Patient</h2>
        <dl>
          <dt>Date of birth</dt>
          <dd>{visit.patient.dateOfBirth.toLocaleDateString()}</dd>
          <dt>Gender</dt>
          <dd>{visit.patient.gender}</dd>
          <dt>Phone</dt>
          <dd>{visit.patient.phone ?? '—'}</dd>
          <dt>Address</dt>
          <dd>{visit.patient.address ?? '—'}</dd>
        </dl>
      </section>

      <section>
        <h2>This visit</h2>
        <dl>
          <dt>Status</dt>
          <dd>{visit.status}</dd>
          <dt>Doctor</dt>
          <dd>{visit.doctor.name}</dd>
          <dt>Department</dt>
          <dd>{visit.department ?? '—'}</dd>
          <dt>Since</dt>
          <dd>{visit.visitDate.toLocaleString()}</dd>
        </dl>

        {visit.status === 'WAITING' && (
          <form action={startConsultationAction}>
            <input type="hidden" name="visitId" value={visit.id} />
            <button type="submit">Start consultation</button>
          </form>
        )}

        {visit.status === 'IN_CONSULTATION' && (
          <>
            <form action={saveNotesAction}>
              <input type="hidden" name="visitId" value={visit.id} />
              <label>
                Consultation notes (optional)
                <textarea name="notes" defaultValue={visit.consultationNotes ?? ''} rows={4} />
              </label>
              <button type="submit">Save notes</button>
            </form>
            <p>
              <em>
                Complete consultation will be available once a prescription has been uploaded
                against this visit (the Prescription Digitization module hasn&apos;t been built
                yet).
              </em>
            </p>
          </>
        )}

        {(visit.status === 'COMPLETED' || visit.status === 'CANCELLED') && (
          <p>Consultation notes: {visit.consultationNotes ?? '—'}</p>
        )}
      </section>

      <section>
        <h2>Visit history</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Doctor</th>
              <th>Status</th>
              <th>Prescriptions</th>
            </tr>
          </thead>
          <tbody>
            {history.visits.map((pastVisit) => (
              <tr key={pastVisit.id}>
                <td>{pastVisit.visitDate.toLocaleDateString()}</td>
                <td>{pastVisit.doctor.name}</td>
                <td>{pastVisit.status}</td>
                <td>{pastVisit.prescriptions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
