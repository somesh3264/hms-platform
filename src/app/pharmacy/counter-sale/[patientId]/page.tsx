import { DEFAULT_TAX_PERCENT } from '@/billing';
import { listMedicines, searchMedicines } from '@/inventory';
import { prisma, requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { UpiQrCode } from '@/app/components/UpiQrCode';

import { completeCounterSaleAction } from './actions';

// Same search-bar-plus-full-catalog-table pattern as the prescription
// dispense screen (src/app/pharmacy/[prescriptionId]/page.tsx) -- a later,
// explicitly requested consistency fix, replacing an earlier version that
// used a handful of blank <select> dropdown rows instead. The one real
// difference from the dispense screen: dispensing there is repeatable
// (one medicine, one immediate Server Action call, accumulating into
// "Dispensed so far"), since it's billed later. A counter sale has nothing
// to bill later -- createCounterSale (src/billing/counter-sale.ts) takes
// every medicine in one atomic transaction -- so this is one table with a
// quantity input per row and a single "Complete sale" button at the
// bottom, not a per-row submit button. One consequence worth knowing:
// since there's no server-side "cart" persisted between requests,
// re-searching before completing the sale does lose quantities already
// typed into other rows (a plain GET reload of this whole page) -- fine
// for the common case of picking from the full list, since the catalog is
// shown unfiltered by default and search is just a narrowing convenience,
// but worth revisiting if that turns out to matter in practice.
export default async function CounterSalePatientPage({
  params,
  searchParams,
}: {
  params: { patientId: string };
  searchParams: { medQuery?: string; success?: string; error?: string; sid?: string };
}) {
  const { hospitalId } = await requireSession(['PHARMACIST']);
  const medQuery = searchParams.medQuery?.trim() ?? '';

  const { patient, medicineResults } = await withHospitalContext(hospitalId, async (tx) => {
    const patient = await tx.patient.findFirstOrThrow({
      where: { id: params.patientId, hospitalId },
      select: { id: true, name: true, patientCode: true },
    });
    const medicineResults = medQuery
      ? await searchMedicines(tx, { hospitalId, query: medQuery })
      : await listMedicines(tx, hospitalId);
    return { patient, medicineResults };
  });
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { upiQrCodeUrl: true },
  });

  return (
    <main>
      <h1>
        Counter Sale — {patient.name} ({patient.patientCode})
      </h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <h2>Medicines</h2>
        <form method="get">
          <input
            type="text"
            name="medQuery"
            defaultValue={medQuery}
            placeholder="Search medicines by name"
          />
          <button type="submit">Search</button>
        </form>

        <form key={searchParams.sid ?? 'idle'} action={completeCounterSaleAction}>
          <input type="hidden" name="patientId" value={patient.id} />

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>In stock</th>
                <th>Unit price</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {medicineResults.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    {medQuery ? 'No matching medicines.' : 'No medicines in inventory.'}
                  </td>
                </tr>
              )}
              {medicineResults.map((medicine) => (
                <tr key={medicine.id}>
                  <td>{medicine.name}</td>
                  <td>{medicine.stockQuantity}</td>
                  <td>₹{(medicine.unitPriceCents / 100).toFixed(2)}</td>
                  <td>
                    <input type="hidden" name="medicineId" value={medicine.id} />
                    <input
                      type="number"
                      name="quantity"
                      min={0}
                      max={medicine.stockQuantity}
                      defaultValue={0}
                      disabled={medicine.stockQuantity === 0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <label>
            Discount (₹)
            <input type="number" name="discountRupees" min={0} step="0.01" defaultValue={0} />
          </label>
          <label>
            Tax (%)
            <input
              type="number"
              name="taxPercent"
              min={0}
              step="0.01"
              defaultValue={DEFAULT_TAX_PERCENT}
            />
          </label>
          <label>
            Payment method
            <select name="paymentMethod" defaultValue="" required>
              <option value="" disabled>
                Select…
              </option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
            </select>
          </label>
          <label>
            Reference (UPI UTR, or a cash receipt note)
            <input type="text" name="paymentReference" />
          </label>
          <UpiQrCode url={hospital.upiQrCodeUrl} />
          <button type="submit">Complete sale &amp; collect payment</button>
        </form>
      </section>
    </main>
  );
}
