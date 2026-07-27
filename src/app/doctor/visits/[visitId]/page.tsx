import { getPatientHistory } from '@/patients';
import { requireSession, withHospitalContext } from '@/shared';
import { getVisitDetail } from '@/visits';

import { StatusBadge } from '@/app/components/StatusBadge';

import {
  completeConsultationAction,
  replacePrescriptionAction,
  saveNotesAction,
  startConsultationAction,
  uploadPrescriptionAction,
} from './actions';

export default async function VisitDetailPage({ params }: { params: { visitId: string } }) {
  const { hospitalId } = await requireSession(['DOCTOR']);

  const { visit, history } = await withHospitalContext(hospitalId, async (tx) => {
    const visit = await getVisitDetail(tx, { hospitalId, visitId: params.visitId });
    const history = await getPatientHistory(tx, { hospitalId, patientId: visit.patientId });
    return { visit, history };
  });

  const hasUploadedPrescription = visit.prescriptions.some((p) => p.status === 'UPLOADED');

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
          <dd>
            <StatusBadge status={visit.status} />
          </dd>
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

            {hasUploadedPrescription ? (
              <form action={completeConsultationAction}>
                <input type="hidden" name="visitId" value={visit.id} />
                <button type="submit">Complete consultation</button>
              </form>
            ) : (
              <p>
                <em>Upload a prescription below before completing this consultation.</em>
              </p>
            )}
          </>
        )}

        {(visit.status === 'COMPLETED' || visit.status === 'CANCELLED') && (
          <p>Consultation notes: {visit.consultationNotes ?? '—'}</p>
        )}
      </section>

      <section>
        <h2>Prescriptions</h2>

        {visit.status === 'IN_CONSULTATION' && (
          <form action={uploadPrescriptionAction}>
            <input type="hidden" name="visitId" value={visit.id} />
            <label>
              Scanned prescription (image or PDF)
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                required
              />
            </label>
            <button type="submit">Upload</button>
          </form>
        )}

        {visit.prescriptions.length === 0 ? (
          <p>No prescriptions uploaded for this visit yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Uploaded</th>
                <th>Status</th>
                <th>File</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visit.prescriptions.map((prescription) => (
                <tr key={prescription.id}>
                  <td>{prescription.createdAt.toLocaleString()}</td>
                  <td>
                    <StatusBadge status={prescription.status} />
                  </td>
                  <td>
                    <a href={prescription.fileUrl} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </td>
                  <td>
                    {prescription.status === 'UPLOADED' && (
                      <form action={replacePrescriptionAction}>
                        <input type="hidden" name="visitId" value={visit.id} />
                        <input type="hidden" name="prescriptionId" value={prescription.id} />
                        <input
                          type="file"
                          name="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          required
                        />
                        <button type="submit">Replace (wrong scan)</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <td>
                  <StatusBadge status={pastVisit.status} />
                </td>
                <td>{pastVisit.prescriptions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
