import Link from 'next/link';

import { listLowStockMedicines } from '@/inventory';
import { listPharmacyQueue } from '@/prescriptions';
import { formatISTDateTime, requireSession, withHospitalContext } from '@/shared';

import { AutoRefresh } from '@/app/components/AutoRefresh';

// Worklist proving FR-5.4's routing: a prescription appears here the moment
// it's uploaded from the doctor's consultation screen, with no separate
// routing step. Each row links to the dispensing screen (FR-6.1).
export default async function PharmacyQueuePage() {
  const { hospitalId } = await requireSession(['PHARMACIST']);

  const { queue, lowStock } = await withHospitalContext(hospitalId, async (tx) => {
    const queue = await listPharmacyQueue(tx, hospitalId);
    const lowStock = await listLowStockMedicines(tx, hospitalId);
    return { queue, lowStock };
  });

  return (
    <main>
      {/* Auto-refresh so a prescription a doctor just uploaded, or a
          consultation they just completed, shows up here without the
          pharmacist manually reloading. Safe on this page specifically
          because it has no forms to lose in-progress input to -- unlike
          front desk's queue, which deliberately does NOT do this (see that
          page's own comment). Was a raw <meta http-equiv="refresh"> tag
          (no client JS) until a later, explicitly reported bug: the
          browser's refresh timer it armed wasn't reliably cancelled by a
          client-side navigation away from this page, so it kept firing
          from wherever the pharmacist had since navigated to -- silently
          pulling them back to this page's own content up to 30s later.
          AutoRefresh (a client component, like PrintButton) fixes this by
          tying the interval to React's own mount/unmount lifecycle instead
          of the browser's independent, un-cancellable-from-here timer. */}
      <AutoRefresh intervalSeconds={30} />
      <h1>Pharmacy Queue</h1>
      <p>
        <Link href="/pharmacy/inventory">View inventory</Link>
      </p>

      {lowStock.length > 0 && (
        <p className="alert alert-warning">
          <strong>Low stock:</strong> {lowStock.map((m) => m.name).join(', ')}
        </p>
      )}

      <section>
        {queue.length === 0 ? (
          <p>No prescriptions waiting.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Patient</th>
                <th>Uploaded by</th>
                <th>Scan</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.map((prescription) => (
                <tr key={prescription.id}>
                  <td>{formatISTDateTime(prescription.createdAt)}</td>
                  <td>
                    {prescription.patient.name} ({prescription.patient.patientCode})
                  </td>
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
      </section>
    </main>
  );
}
