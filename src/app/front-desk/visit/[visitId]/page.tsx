import Link from 'next/link';

import { formatISTDateTime, requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { StatusBadge } from '@/app/components/StatusBadge';

import { replacePrescriptionAction, uploadPrescriptionAction } from './actions';

// Everything front desk needs for one visit -- consultation fee bill, any
// other front-desk charges (surgery/procedure), the printable prescription
// form, and now attaching the doctor's prescription scan. Originally just
// the print landing spot right after registering/collecting a fee (a later,
// explicitly requested change from redirecting straight back to
// /front-desk, so front desk could print immediately instead of hunting for
// it afterwards); now also the target of a dedicated "Bills" link from the
// waiting queue and "Completed today", and of "In consultation"/"Completed
// today"'s "Attach prescription" link (see CLAUDE.md's "Front desk attaches
// prescription scans" section -- the doctor's consultation room has no
// scanner, so the doctor calls front desk to scan the paper prescription in
// instead of uploading it themselves). The upload form itself works on a
// visit that's IN_CONSULTATION *or* already COMPLETED -- completing a
// consultation no longer waits on a prescription existing first, so the
// scan very often gets attached after the doctor has already moved on to
// the next patient. Every bill on the visit is listed generically
// (number/total/status), not just a single assumed "the" consultation-fee
// one, since a visit can carry several (consultation fee, one or more
// front-desk charges, and -- once completed -- a pharmacy medicine bill
// too).
export default async function VisitCreatedPage({
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
      select: {
        id: true,
        tokenNumber: true,
        status: true,
        patient: { select: { name: true, patientCode: true } },
        doctor: { select: { name: true } },
        bills: {
          select: { id: true, billNumber: true, totalCents: true, paymentStatus: true },
          orderBy: { createdAt: 'asc' },
        },
        prescriptions: { orderBy: { createdAt: 'asc' } },
      },
    }),
  );

  return (
    <main>
      <h1>
        {visit.patient.name} ({visit.patient.patientCode})
      </h1>
      <p>
        {visit.doctor.name}
        {visit.tokenNumber ? ` — Token #${visit.tokenNumber}` : ''}
      </p>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <h2>Print for this visit</h2>
        <ul>
          {visit.bills.map((bill) => (
            <li key={bill.id}>
              <Link href={`/billing/${bill.id}`}>
                Print bill {bill.billNumber} (₹{(bill.totalCents / 100).toFixed(2)})
              </Link>{' '}
              <StatusBadge status={bill.paymentStatus} />
            </li>
          ))}
          <li>
            <Link href={`/front-desk/prescription-form/${visit.id}`}>Print prescription form</Link>
          </li>
        </ul>
      </section>

      <section>
        <h2>Prescription</h2>

        {(visit.status === 'IN_CONSULTATION' || visit.status === 'COMPLETED') &&
          !visit.prescriptions.some((p) => p.status === 'UPLOADED') && (
            <form key={searchParams.sid ?? 'idle'} action={uploadPrescriptionAction}>
              <input type="hidden" name="visitId" value={visit.id} />
              <label>
                Scanned prescription (image or PDF)
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  required
                />
              </label>
              <button type="submit">Upload</button>
            </form>
          )}

        {visit.prescriptions.length === 0 ? (
          <p>No prescription attached for this visit yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Uploaded</th>
                <th>Status</th>
                <th>File</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visit.prescriptions.map((prescription) => (
                <tr key={prescription.id}>
                  <td>{formatISTDateTime(prescription.createdAt)}</td>
                  <td>
                    <StatusBadge status={prescription.status} />
                  </td>
                  <td>
                    <a href={prescription.fileUrl} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </td>
                  <td>
                    {prescription.status === 'UPLOADED' && (
                      <form action={replacePrescriptionAction}>
                        <input type="hidden" name="visitId" value={visit.id} />
                        <input type="hidden" name="prescriptionId" value={prescription.id} />
                        <input
                          type="file"
                          name="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          required
                        />
                        <button type="submit">Reupload</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p>
        <Link href="/front-desk">Back to Front Desk</Link>
      </p>
    </main>
  );
}
