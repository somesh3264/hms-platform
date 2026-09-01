import { DEFAULT_TAX_PERCENT } from '@/billing';
import { listMedicines, searchMedicines } from '@/inventory';
import { prisma, requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { UpiQrCode } from '@/app/components/UpiQrCode';

import {
  dispenseCounterSaleItemAction,
  finalizeCounterSaleAction,
  removeCounterSaleItemAction,
  updateCounterSaleItemQuantityAction,
} from './actions';

// Mirrors the prescription dispense screen (src/app/pharmacy/[prescriptionId]/
// page.tsx) exactly -- a later, explicitly requested consistency fix.
// Dispensing here is repeatable, one medicine at a time via its own
// "Dispense" button, accumulating into a "Dispensed so far" list, same
// interaction shape as the pharmacy queue's own dispense screen (an earlier
// version instead used a single table of quantity inputs with one bulk
// submit button at the bottom -- no per-row action, unlike the real dispense
// screen it was meant to match). The one structural difference from that
// screen: there's no Prescription to anchor unbilled line items to (the
// existing billId-null convention), so addCounterSaleItem
// (src/billing/counter-sale.ts) creates the Bill itself -- a real "cart" --
// the moment the first item is dispensed, and this page just looks up
// whichever Bill is currently open (PENDING, no visit) for this patient.
export default async function CounterSalePatientPage({
  params,
  searchParams,
}: {
  params: { patientId: string };
  searchParams: { medQuery?: string; success?: string; error?: string };
}) {
  const { hospitalId } = await requireSession(['PHARMACIST']);
  const medQuery = searchParams.medQuery?.trim() ?? '';

  const { patient, openBill, medicineResults } = await withHospitalContext(
    hospitalId,
    async (tx) => {
      const patient = await tx.patient.findFirstOrThrow({
        where: { id: params.patientId, hospitalId },
        select: { id: true, name: true, patientCode: true },
      });
      const openBill = await tx.bill.findFirst({
        where: { hospitalId, patientId: patient.id, visitId: null, paymentStatus: 'PENDING' },
        include: { lineItems: true },
      });
      const medicineResults = medQuery
        ? await searchMedicines(tx, { hospitalId, query: medQuery })
        : await listMedicines(tx, hospitalId);
      return { patient, openBill, medicineResults };
    },
  );
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
        <h2>Dispensed so far</h2>
        {!openBill || openBill.lineItems.length === 0 ? (
          <p>Nothing dispensed yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {openBill.lineItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>
                    <form action={updateCounterSaleItemQuantityAction} className="inline-fields">
                      <input type="hidden" name="patientId" value={patient.id} />
                      <input type="hidden" name="billId" value={openBill.id} />
                      <input type="hidden" name="billLineItemId" value={item.id} />
                      <input
                        type="number"
                        name="quantity"
                        min={1}
                        defaultValue={item.quantity}
                        required
                      />
                      <button type="submit">Update</button>
                    </form>
                  </td>
                  <td>₹{(item.unitPriceCents / 100).toFixed(2)}</td>
                  <td>
                    <form action={removeCounterSaleItemAction}>
                      <input type="hidden" name="patientId" value={patient.id} />
                      <input type="hidden" name="billId" value={openBill.id} />
                      <input type="hidden" name="billLineItemId" value={item.id} />
                      <button type="submit">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {openBill && openBill.lineItems.length > 0 && (
        // Above the medicine catalog, same reasoning as the prescription
        // dispense screen's own "Finalize dispensing & bill" placement
        // (src/app/pharmacy/[prescriptionId]/page.tsx): with a full
        // inventory list below it, this would otherwise sit off screen
        // until the pharmacist scrolled past everything else.
        <section>
          <h2>Finalize sale &amp; collect payment</h2>
          <form action={finalizeCounterSaleAction}>
            <input type="hidden" name="patientId" value={patient.id} />
            <input type="hidden" name="billId" value={openBill.id} />
            <p>Enter either a discount percentage or a cash discount below, not both.</p>
            <label>
              Discount percentage (%)
              <input type="number" name="discountPercent" min={0} max={100} step="0.01" />
            </label>
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
      )}

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
                  <form action={dispenseCounterSaleItemAction}>
                    <input type="hidden" name="patientId" value={patient.id} />
                    <input type="hidden" name="medicineId" value={medicine.id} />
                    <input type="hidden" name="medQuery" value={medQuery} />
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
      </section>
    </main>
  );
}
