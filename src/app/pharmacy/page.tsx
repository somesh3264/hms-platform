import Link from 'next/link';

import { listLowStockMedicines } from '@/inventory';
import { listPharmacyQueue } from '@/prescriptions';
import { withHospitalContext } from '@/shared';
import { getDevPharmacistSession } from '@/shared/dev-session';

// Worklist proving FR-5.4's routing: a prescription appears here the moment
// it's uploaded from the doctor's consultation screen, with no separate
// routing step. Each row links to the dispensing screen (FR-6.1).
export default async function PharmacyQueuePage() {
  const { hospitalId } = await getDevPharmacistSession();

  const { queue, lowStock } = await withHospitalContext(hospitalId, async (tx) => {
    const queue = await listPharmacyQueue(tx, hospitalId);
    const lowStock = await listLowStockMedicines(tx, hospitalId);
    return { queue, lowStock };
  });

  return (
    <main>
      <h1>Pharmacy Queue</h1>
      <p>
        <Link href="/pharmacy/inventory">View inventory</Link>
      </p>

      {lowStock.length > 0 && (
        <p>
          <strong>Low stock:</strong> {lowStock.map((m) => m.name).join(', ')}
        </p>
      )}

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
              <th></th>
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
                <td>
                  <Link href={`/pharmacy/${prescription.id}`}>Dispense</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
