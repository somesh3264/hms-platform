import { getBillDetail } from '@/billing';
import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { StatusBadge } from '@/app/components/StatusBadge';

import { recordPaymentAction } from './actions';

// Printable via the browser's native print (Ctrl/Cmd+P) -- no PDF library
// dependency, no client component. @media print hides the payment form and
// nav so what prints is just the invoice, satisfying FR-7.6 (print/export
// with hospital name and logo) without server-side PDF generation, which
// the TRD calls for but isn't built here.
export default async function BillDetailPage({
  params,
  searchParams,
}: {
  params: { billId: string };
  searchParams: { success?: string; error?: string };
}) {
  // FR-8.2: any authorized staff role can open a past bill from a patient's
  // record (src/app/patients/[patientId]), not just the pharmacist -- the
  // payment form below is still restricted to PHARMACIST, who bills for the
  // medicines they dispense themselves (no separate billing-staff role).
  const { hospitalId, role } = await requireSession();

  const bill = await withHospitalContext(hospitalId, (tx) =>
    getBillDetail(tx, { hospitalId, billId: params.billId }),
  );

  return (
    <main>
      <header>
        {/* Plain <img>, not next/image -- see the pharmacy dispensing page
            for the same rationale (local dev-only storage, arbitrary source). */}
        {bill.hospital.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bill.hospital.logoUrl} alt={bill.hospital.name} style={{ maxHeight: '80px' }} />
        )}
        <h1>{bill.hospital.name}</h1>
        {bill.hospital.address && <p>{bill.hospital.address}</p>}
        {bill.hospital.gstin && <p>GSTIN: {bill.hospital.gstin}</p>}
      </header>

      <div className="no-print">
        <FlashMessage success={searchParams.success} error={searchParams.error} />
      </div>

      <section>
        <h2>Invoice {bill.billNumber}</h2>
        <dl>
          <dt>Patient</dt>
          <dd>
            {bill.patient.firstName} {bill.patient.lastName} ({bill.patient.patientCode})
          </dd>
          <dt>Visit date</dt>
          <dd>{bill.visit.visitDate.toLocaleDateString()}</dd>
          <dt>Issued</dt>
          <dd>{bill.issuedAt?.toLocaleString() ?? '—'}</dd>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={bill.paymentStatus} />
          </dd>
        </dl>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {bill.lineItems.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>₹{(item.unitPriceCents / 100).toFixed(2)}</td>
                <td>₹{(item.lineTotalCents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl>
          <dt>Subtotal</dt>
          <dd>₹{(bill.subtotalCents / 100).toFixed(2)}</dd>
          <dt>Discount</dt>
          <dd>-₹{(bill.discountCents / 100).toFixed(2)}</dd>
          <dt>Tax</dt>
          <dd>₹{(bill.taxCents / 100).toFixed(2)}</dd>
          <dt>
            <strong>Total</strong>
          </dt>
          <dd>
            <strong>₹{(bill.totalCents / 100).toFixed(2)}</strong>
          </dd>
        </dl>

        {bill.paymentStatus === 'PAID' && (
          <p>
            Paid via {bill.paymentMethod} on {bill.paidAt?.toLocaleString()}
            {bill.paymentReference && ` (ref: ${bill.paymentReference})`}
          </p>
        )}
      </section>

      {bill.paymentStatus === 'PENDING' && role === 'PHARMACIST' && (
        <section className="no-print">
          <h2>Record payment</h2>
          <form action={recordPaymentAction}>
            <input type="hidden" name="billId" value={bill.id} />
            <label>
              Method
              <select name="paymentMethod" required>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
              </select>
            </label>
            <label>
              Reference (UPI UTR, or a cash receipt note)
              <input type="text" name="paymentReference" />
            </label>
            <button type="submit">Record payment</button>
          </form>
        </section>
      )}
    </main>
  );
}
