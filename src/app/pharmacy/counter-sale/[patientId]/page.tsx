import { DEFAULT_TAX_PERCENT } from '@/billing';
import { listMedicines } from '@/inventory';
import { prisma, requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { UpiQrCode } from '@/app/components/UpiQrCode';

import { completeCounterSaleAction } from './actions';

// Fixed number of blank medicine+quantity row pairs, same reasoning as
// front-desk's CHARGE_ROWS (src/app/front-desk/bill/[visitId]/page.tsx) --
// this app has no client-side JS to grow a form, and a handful of rows
// comfortably covers a typical counter purchase. A plain <select> listing
// every medicine (not a search box, unlike the prescription-dispense
// screen) since every browser's native select is already type-ahead
// searchable, matching how "Assign doctor" elsewhere in the app works.
const SALE_ROWS = 6;

export default async function CounterSalePatientPage({
  params,
  searchParams,
}: {
  params: { patientId: string };
  searchParams: { success?: string; error?: string; sid?: string };
}) {
  const { hospitalId } = await requireSession(['PHARMACIST']);

  const { patient, medicines } = await withHospitalContext(hospitalId, async (tx) => {
    const patient = await tx.patient.findFirstOrThrow({
      where: { id: params.patientId, hospitalId },
      select: { id: true, name: true, patientCode: true },
    });
    const medicines = await listMedicines(tx, hospitalId);
    return { patient, medicines };
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
        <form key={searchParams.sid ?? 'idle'} action={completeCounterSaleAction}>
          <input type="hidden" name="patientId" value={patient.id} />
          {Array.from({ length: SALE_ROWS }, (_, i) => (
            <div className="inline-fields" key={i}>
              <label>
                Medicine
                <select name="medicineId" defaultValue="">
                  <option value=""></option>
                  {medicines.map((medicine) => (
                    <option key={medicine.id} value={medicine.id} disabled={medicine.stockQuantity === 0}>
                      {medicine.name} — ₹{(medicine.unitPriceCents / 100).toFixed(2)} (stock:{' '}
                      {medicine.stockQuantity})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input type="number" name="quantity" min={1} />
              </label>
            </div>
          ))}
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
