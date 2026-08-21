import Link from 'next/link';

import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { StatusBadge } from '@/app/components/StatusBadge';

// What's printable for one visit -- consultation fee bill, any other
// front-desk charges (surgery/procedure), and the prescription form, all in
// one place. Originally just the landing spot right after registering/
// collecting a fee (a later, explicitly requested change from redirecting
// straight back to /front-desk, so front desk could print immediately
// instead of hunting for it afterwards); now also the target of a
// dedicated "Bills" link from the waiting queue and "Completed today"
// (another later, explicitly requested addition -- previously there was no
// way back to a bill once its row stopped showing the fee-collection form,
// so a missed print had no recovery short of searching the patient's own
// record). Every bill on the visit is listed generically (number/total/
// status), not just a single assumed "the" consultation-fee one, since a
// visit can carry several (consultation fee, one or more front-desk
// charges, and -- once completed -- a pharmacy medicine bill too).
export default async function VisitCreatedPage({
  params,
  searchParams,
}: {
  params: { visitId: string };
  searchParams: { success?: string; error?: string };
}) {
  const { hospitalId } = await requireSession(['FRONT_DESK']);

  const visit = await withHospitalContext(hospitalId, (tx) =>
    tx.visit.findFirstOrThrow({
      where: { id: params.visitId, hospitalId },
      select: {
        id: true,
        tokenNumber: true,
        patient: { select: { name: true, patientCode: true } },
        doctor: { select: { name: true } },
        bills: {
          select: { id: true, billNumber: true, totalCents: true, paymentStatus: true },
          orderBy: { createdAt: 'asc' },
        },
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

      <p>
        <Link href="/front-desk">Back to Front Desk</Link>
      </p>
    </main>
  );
}
