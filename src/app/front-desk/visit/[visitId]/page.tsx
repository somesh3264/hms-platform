import Link from 'next/link';

import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';

// Landing spot after any front-desk action that leaves a visit ready for
// its doctor (registering with a doctor assigned, "Create visit", or
// collecting a deferred consultation fee from the waiting queue) -- a
// later, explicitly requested change from redirecting straight back to
// /front-desk, so front desk can print what this visit needs right away
// instead of hunting for it in the waiting queue afterwards. Two possible
// documents, not always both: the consultation fee bill only if a fee was
// actually collected (a WAITING visit can only ever have a Bill from that
// step, see src/visits/queue.ts's listWaitingQueue), and the prescription
// form always, since reaching this page at all means a doctor was already
// assigned.
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
        bills: { where: { paymentStatus: 'PAID' }, select: { id: true } },
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
          {visit.bills[0] && (
            <li>
              <Link href={`/billing/${visit.bills[0].id}`}>Print consultation fee bill</Link>
            </li>
          )}
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
