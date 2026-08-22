import type { Metadata } from 'next';

import { getBillDetail } from '@/billing';
import { formatISTDate, requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { PrintButton } from '@/app/components/PrintButton';
import { UpiQrCode } from '@/app/components/UpiQrCode';

import { recordPaymentAction } from './actions';

// Names the "Save as PDF" file after the patient rather than the page's
// generic "HMS Platform" default (a later, explicitly requested fix -- as
// the patient count grows, a folder of same-named downloads is useless).
// Browsers seed the print dialog's suggested filename from the document
// title, so this is the whole fix; it doesn't change what's shown on-page.
export async function generateMetadata({
  params,
}: {
  params: { billId: string };
}): Promise<Metadata> {
  const { hospitalId } = await requireSession();
  const bill = await withHospitalContext(hospitalId, (tx) =>
    tx.bill.findFirst({
      where: { id: params.billId, hospitalId },
      select: { billNumber: true, patient: { select: { name: true, patientCode: true } } },
    }),
  );
  if (!bill) {
    return {};
  }
  return { title: `${bill.patient.name} (${bill.patient.patientCode}) - Bill ${bill.billNumber}` };
}

function formatRupees(cents: number): string {
  return `${(cents / 100).toFixed(2)} INR`;
}

// Printable via the browser's native print (Ctrl/Cmd+P, or the explicit
// PrintButton below) -- no PDF library dependency. @media print hides
// the payment form/nav/button so what prints is just the invoice,
// satisfying FR-7.6 (print/export with hospital name and logo) without
// server-side PDF generation, which the TRD calls for but isn't built here;
// "download" is the browser's own print dialog's "Save as PDF" destination,
// not a separately generated file.
//
// Layout modeled on a reference invoice format the hospital provided (a
// later, explicitly requested change from the original simpler dl/table
// layout): a two-column header (branding on the left, contact/registration
// on the right), a two-column patient block, a "By: Dr. X" line, the line
// items table, and a totals block reporting Amount Received/Balance Amount
// rather than just a payment-status badge. GSTIN isn't part of the
// reference format but already exists as real hospital data (FR-7.6 calls
// for it on the printable bill) -- kept in the header's right column rather
// than silently dropped.
//
// A bill carrying a MEDICINE line item (see isMedicineBill below) is a
// transaction of the hospital's in-house medical store, a separate
// registered entity from the hospital itself -- shows that store's own
// name/GSTIN (Hospital.pharmacyName/pharmacyGstin) instead of the
// hospital's, omits the hospital's clinical-establishment registration
// number (belongs to the hospital, not the store), and omits the "By: Dr.
// X" line (a later, explicitly requested set of changes, kept deliberately
// minimal per that same request -- everything else about the bill stays
// exactly as it is for a medicine bill).
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

  const isPaid = bill.paymentStatus === 'PAID';
  // The pharmacist's billing flow (createBill) is the only path that ever
  // attaches a MEDICINE line item; front desk's own bills (consultation
  // fee, surgery/procedure charges) are always SERVICE-only. A bill with
  // any medicine on it is therefore a transaction of the in-house medical
  // store, not the hospital itself -- a later, explicitly requested
  // distinction, since the store trades under its own name/GSTIN. Falls
  // back to the hospital's own name/gstin when the pharmacy-specific ones
  // aren't configured, rather than showing blank branding.
  const isMedicineBill = bill.lineItems.some((item) => item.itemType === 'MEDICINE');
  const billerName = (isMedicineBill && bill.hospital.pharmacyName) || bill.hospital.name;
  const billerGstin = (isMedicineBill && bill.hospital.pharmacyGstin) || bill.hospital.gstin;

  return (
    <main>
      <div className="no-print">
        <FlashMessage success={searchParams.success} error={searchParams.error} />
        <PrintButton />
      </div>

      <div className="invoice">
        <div className="invoice-header">
          <div className="invoice-header-left">
            {/* Plain <img>, not next/image -- see the pharmacy dispensing
                page for the same rationale (local dev-only storage,
                arbitrary source). */}
            {bill.hospital.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bill.hospital.logoUrl}
                alt={billerName}
                className="invoice-logo"
              />
            )}
            <div>
              <h1>{billerName}</h1>
              {bill.hospital.address && <p>{bill.hospital.address}</p>}
              {bill.hospital.website && <p>{bill.hospital.website}</p>}
            </div>
          </div>
          <div className="invoice-header-right">
            {bill.hospital.contactPhone && <p>Contact No. {bill.hospital.contactPhone}</p>}
            {!isMedicineBill && bill.hospital.registrationNumber && (
              <p>Reg.no. {bill.hospital.registrationNumber}</p>
            )}
            {billerGstin && <p>GSTIN: {billerGstin}</p>}
          </div>
        </div>

        <hr className="invoice-rule" />

        <div className="invoice-header">
          <div>
            <p className="invoice-patient-name">{bill.patient.name}</p>
            <p>Patient Id: {bill.patient.patientCode}</p>
            {bill.patient.phone && <p>{bill.patient.phone}</p>}
            {bill.patient.email && <p>{bill.patient.email}</p>}
          </div>
          <div className="invoice-header-right">
            <p>
              {bill.patient.gender}, {bill.patient.age} years
            </p>
            {bill.patient.address && <p>{bill.patient.address}</p>}
          </div>
        </div>

        <hr className="invoice-rule" />

        {/* bill.visit is only ever null for a Counter Sale
            (src/billing/counter-sale.ts), which is always a medicine bill
            (isMedicineBill true) -- the explicit bill.visit check here is
            for TypeScript's benefit as much as runtime safety, since it
            can't infer that correlation from isMedicineBill alone. */}
        {!isMedicineBill && bill.visit?.doctor && (
          <p>
            By: <strong>{bill.visit.doctor.name}</strong>
          </p>
        )}

        <div className="invoice-header">
          <h2 className="invoice-title">Invoice</h2>
          <div className="invoice-header-right">
            <p>
              Date: <strong>{formatISTDate(bill.issuedAt ?? bill.createdAt)}</strong>
            </p>
            <p>
              Invoice Number: <strong>{bill.billNumber}</strong>
            </p>
          </div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Treatments &amp; Products</th>
              <th>Unit Cost INR</th>
              <th>Qty</th>
              <th>Total Cost INR</th>
            </tr>
          </thead>
          <tbody>
            {bill.lineItems.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}.</td>
                <td>
                  {item.description}
                  <div className="invoice-item-date">Date {formatISTDate(item.createdAt)}</div>
                </td>
                <td>{(item.unitPriceCents / 100).toFixed(2)}</td>
                <td>{item.quantity}</td>
                <td>{(item.lineTotalCents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-summary">
          {isPaid && (
            <div className="invoice-payment-details">
              <h3>Payment Details</h3>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Receipt Number</th>
                    <th>Mode Of Payment</th>
                    <th>Amount Paid INR</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{bill.paidAt ? formatISTDate(bill.paidAt) : '—'}</td>
                    {/* paymentReference (UPI UTR / a cash receipt note) is
                        optional and often left blank at payment time --
                        falls back to the bill's own invoice number, which
                        always exists, rather than showing nothing. */}
                    <td>{bill.paymentReference || bill.billNumber}</td>
                    <td>{bill.paymentMethod}</td>
                    <td>{(bill.totalCents / 100).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <dl className="invoice-totals">
            <dt>Total Cost:</dt>
            <dd>{formatRupees(bill.subtotalCents)}</dd>
            {bill.discountCents > 0 && (
              <>
                <dt>Discount:</dt>
                <dd>-{formatRupees(bill.discountCents)}</dd>
              </>
            )}
            {bill.taxCents > 0 && (
              <>
                <dt>Tax:</dt>
                <dd>{formatRupees(bill.taxCents)}</dd>
              </>
            )}
            <dt>Grand Total:</dt>
            <dd>{formatRupees(bill.totalCents)}</dd>
            <dt>Amount Received:</dt>
            <dd>{formatRupees(isPaid ? bill.totalCents : 0)}</dd>
            <dt>Balance Amount:</dt>
            <dd>{formatRupees(isPaid ? 0 : bill.totalCents)}</dd>
          </dl>
        </div>

        {/* Part of the printable invoice itself (not .no-print) -- a later,
            explicitly requested addition so both the on-screen and printed
            copy carry the same reassurance. */}
        <p className="print-footer-note">This bill is digitally generated, seal is not required.</p>
      </div>

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
            <UpiQrCode url={bill.hospital.upiQrCodeUrl} />
            <button type="submit">Record payment</button>
          </form>
        </section>
      )}
    </main>
  );
}
