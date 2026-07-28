import { DEFAULT_TAX_PERCENT } from '@/billing';
import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';

import { generateBillAction } from './actions';

export default async function NewBillPage({
  params,
  searchParams,
}: {
  params: { visitId: string };
  searchParams: { error?: string };
}) {
  const { hospitalId } = await requireSession(['BILLING_STAFF']);

  const { visit, unbilledItems } = await withHospitalContext(hospitalId, async (tx) => {
    const visit = await tx.visit.findFirstOrThrow({
      where: { id: params.visitId, hospitalId },
      include: { patient: true },
    });
    const unbilledItems = await tx.billLineItem.findMany({
      where: { hospitalId, billId: null, prescription: { visitId: visit.id } },
    });
    return { visit, unbilledItems };
  });

  const subtotalCents = unbilledItems.reduce((sum, item) => sum + item.lineTotalCents, 0);

  return (
    <main>
      <h1>
        Generate bill — {visit.patient.firstName} {visit.patient.lastName} (
        {visit.patient.patientCode})
      </h1>

      <FlashMessage error={searchParams.error} />

      <section>
        <h2>Dispensed medicines</h2>
        {unbilledItems.length === 0 ? (
          <p>No dispensed items for this visit -- a service charge alone can still be billed.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {unbilledItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>₹{(item.unitPriceCents / 100).toFixed(2)}</td>
                  <td>₹{(item.lineTotalCents / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>Dispensed subtotal: ₹{(subtotalCents / 100).toFixed(2)}</p>
      </section>

      <section>
        <h2>Bill details</h2>
        <form action={generateBillAction}>
          <input type="hidden" name="visitId" value={visit.id} />
          <label>
            Service charge description (e.g. consultation fee, optional)
            <input type="text" name="serviceDescription" />
          </label>
          <label>
            Service charge amount (₹)
            <input type="number" name="serviceFeeRupees" min={0} step="0.01" />
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
          <button type="submit">Generate bill</button>
        </form>
      </section>
    </main>
  );
}
