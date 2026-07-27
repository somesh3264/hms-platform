import { searchMedicines } from '@/inventory';
import { getPrescriptionDetail } from '@/prescriptions';
import { requireSession, withHospitalContext } from '@/shared';

import { StatusBadge } from '@/app/components/StatusBadge';

import { dispenseItemAction, finalizeDispensingAction } from './actions';

export default async function DispensePrescriptionPage({
  params,
  searchParams,
}: {
  params: { prescriptionId: string };
  searchParams: { medQuery?: string };
}) {
  const { hospitalId } = await requireSession(['PHARMACIST']);
  const medQuery = searchParams.medQuery?.trim() ?? '';

  const { prescription, medicineResults } = await withHospitalContext(hospitalId, async (tx) => {
    const prescription = await getPrescriptionDetail(tx, {
      hospitalId,
      prescriptionId: params.prescriptionId,
    });
    const medicineResults = medQuery
      ? await searchMedicines(tx, { hospitalId, query: medQuery })
      : [];
    return { prescription, medicineResults };
  });

  return (
    <main>
      <h1>
        {prescription.patient.firstName} {prescription.patient.lastName} (
        {prescription.patient.patientCode})
      </h1>

      <section>
        <h2>Prescription</h2>
        <dl>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={prescription.status} />
          </dd>
          <dt>Department</dt>
          <dd>{prescription.visit.department ?? '—'}</dd>
          <dt>Uploaded by</dt>
          <dd>{prescription.uploadedBy.name}</dd>
          <dt>Uploaded</dt>
          <dd>{prescription.createdAt.toLocaleString()}</dd>
        </dl>
        {/* Plain <img>, not next/image: dimensions are unknown (arbitrary
            scanned uploads) and the source is the local dev-only storage
            stand-in, not a configured remote image domain. */}
        {prescription.fileType.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={prescription.fileUrl}
            alt="Scanned prescription"
            style={{ maxWidth: '400px' }}
          />
        ) : (
          <a href={prescription.fileUrl} target="_blank" rel="noreferrer">
            View scan
          </a>
        )}
      </section>

      <section>
        <h2>Dispensed so far</h2>
        {prescription.billLineItems.length === 0 ? (
          <p>Nothing dispensed yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Quantity</th>
                <th>Unit price</th>
              </tr>
            </thead>
            <tbody>
              {prescription.billLineItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>₹{(item.unitPriceCents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {prescription.status === 'UPLOADED' && (
        <>
          <section>
            <h2>Dispense a medicine</h2>
            <form method="get">
              <input
                type="text"
                name="medQuery"
                defaultValue={medQuery}
                placeholder="Search medicines by name"
              />
              <button type="submit">Search</button>
            </form>

            {medQuery && (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>In stock</th>
                    <th>Unit price</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {medicineResults.length === 0 && (
                    <tr>
                      <td colSpan={4}>No matching medicines.</td>
                    </tr>
                  )}
                  {medicineResults.map((medicine) => (
                    <tr key={medicine.id}>
                      <td>{medicine.name}</td>
                      <td>{medicine.stockQuantity}</td>
                      <td>₹{(medicine.unitPriceCents / 100).toFixed(2)}</td>
                      <td>
                        <form action={dispenseItemAction}>
                          <input type="hidden" name="prescriptionId" value={prescription.id} />
                          <input type="hidden" name="medicineId" value={medicine.id} />
                          <input
                            type="number"
                            name="quantity"
                            min={1}
                            max={medicine.stockQuantity}
                            defaultValue={1}
                            required
                          />
                          <button type="submit" disabled={medicine.stockQuantity === 0}>
                            Dispense
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <form action={finalizeDispensingAction}>
              <input type="hidden" name="prescriptionId" value={prescription.id} />
              <button type="submit" disabled={prescription.billLineItems.length === 0}>
                Finalize dispensing
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
