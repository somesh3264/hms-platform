import { listPharmacyQueue } from '@/prescriptions';
import { withHospitalContext } from '@/shared';
import { getDevPharmacistSession } from '@/shared/dev-session';

// Read-only worklist proving FR-5.4's routing: a prescription appears here
// the moment it's uploaded from the doctor's consultation screen, with no
// separate routing step. Dispensing (selecting medicines, decrementing
// stock, marking DISPENSED -- FR-6.x) is the In-House Medical Store module
// (BRS 3.6) and isn't built yet, so there's nothing actionable here yet.
export default async function PharmacyQueuePage() {
  const { hospitalId } = await getDevPharmacistSession();

  const queue = await withHospitalContext(hospitalId, (tx) => listPharmacyQueue(tx, hospitalId));

  return (
    <main>
      <h1>Pharmacy Queue</h1>
      <p>
        <em>
          Dispensing isn&apos;t built yet (In-House Medical Store module) -- this is a read-only
          view of what has been routed here so far.
        </em>
      </p>

      {queue.length === 0 ? (
        <p>No prescriptions waiting.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Patient</th>
              <th>Department</th>
              <th>Uploaded by</th>
              <th>Scan</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((prescription) => (
              <tr key={prescription.id}>
                <td>{prescription.createdAt.toLocaleString()}</td>
                <td>
                  {prescription.patient.firstName} {prescription.patient.lastName} (
                  {prescription.patient.patientCode})
                </td>
                <td>{prescription.visit.department ?? '—'}</td>
                <td>{prescription.uploadedBy.name}</td>
                <td>
                  <a href={prescription.fileUrl} target="_blank" rel="noreferrer">
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
