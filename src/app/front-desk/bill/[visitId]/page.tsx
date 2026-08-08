import { prisma, requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { UpiQrCode } from '@/app/components/UpiQrCode';

import { collectFrontDeskChargesAction } from './actions';

// Fixed number of blank charge rows, not a dynamic add-row list -- this app
// has no client-side JS to grow a form, and a handful of rows comfortably
// covers "consultation + a couple of procedure charges" in one bill.
const CHARGE_ROWS = 4;

export default async function FrontDeskBillPage({
  params,
  searchParams,
}: {
  params: { visitId: string };
  searchParams: { success?: string; error?: string; sid?: string };
}) {
  const { hospitalId } = await requireSession(['FRONT_DESK']);

  const visit = await withHospitalContext(hospitalId, (tx) =>
    tx.visit.findFirstOrThrow({
      where: { id: params.visitId, hospitalId },
      include: { patient: true, doctor: { select: { name: true } } },
    }),
  );
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { upiQrCodeUrl: true },
  });

  return (
    <main>
      <h1>
        Bill — {visit.patient.name} ({visit.patient.patientCode})
      </h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <h2>Surgery / procedure / other charges</h2>
        <p>
          Add one or more charges (e.g. a surgery fee, a procedure, or anything else billed at the
          front desk) and collect payment for all of them together.
        </p>
        <form key={searchParams.sid ?? 'idle'} action={collectFrontDeskChargesAction}>
          <input type="hidden" name="visitId" value={visit.id} />
          {Array.from({ length: CHARGE_ROWS }, (_, i) => (
            <div className="inline-fields" key={i}>
              <label>
                Description
                <input type="text" name="chargeDescription" placeholder="e.g. Minor surgery" />
              </label>
              <label>
                Amount (₹)
                <input type="number" name="chargeAmount" min={0} step="0.01" />
              </label>
            </div>
          ))}
          <label>
            Discount (₹)
            <input type="number" name="discountRupees" min={0} step="0.01" defaultValue={0} />
          </label>
          <label>
            Payment method
            <select name="paymentMethod" required defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
            </select>
          </label>
          <UpiQrCode url={hospital.upiQrCodeUrl} />
          <button type="submit">Generate bill &amp; collect payment</button>
        </form>
      </section>
    </main>
  );
}
