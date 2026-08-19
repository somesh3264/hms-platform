import type { Metadata } from 'next';

import { prisma, requireSession, withHospitalContext } from '@/shared';

import { PrintButton } from '@/app/components/PrintButton';

// Digitizes one specific step of the hospital's existing paper process (a
// later, explicitly requested addition, not a numbered BRS/TRD FR): front
// desk currently hand-writes the patient's name/age/sex onto a blank
// pre-printed prescription letterhead before handing it to the patient, who
// carries it to the doctor -- the doctor has no printer of their own, only
// front desk does. This page prints that same letterhead with the patient's
// details already typed in, leaving the rest blank for the doctor's pen.
// It is NOT the app's own Prescription entity (src/prescriptions) -- that
// stays exactly as it is: once the doctor has hand-written on this printed
// page, they photograph/scan it and upload it through the existing
// "Scanned prescription" flow on their own visit screen, same as today.
// This page only ever reads Patient/Visit/Hospital data that already
// exists; it creates nothing.
async function loadPrescriptionForm(hospitalId: string, visitId: string) {
  return withHospitalContext(hospitalId, (tx) =>
    tx.visit.findFirstOrThrow({
      where: { id: visitId, hospitalId },
      select: {
        id: true,
        visitDate: true,
        tokenNumber: true,
        patient: { select: { name: true, patientCode: true, age: true, gender: true } },
        doctor: { select: { name: true, department: true } },
      },
    }),
  );
}

// Same "download filename should identify the patient" fix as the bill
// (src/app/billing/[billId]/page.tsx) -- see that file's generateMetadata
// for why this is enough on its own.
export async function generateMetadata({
  params,
}: {
  params: { visitId: string };
}): Promise<Metadata> {
  const { hospitalId } = await requireSession(['FRONT_DESK']);
  const visit = await loadPrescriptionForm(hospitalId, params.visitId);
  return {
    title: `${visit.patient.name} (${visit.patient.patientCode}) - Prescription Form`,
  };
}

export default async function PrescriptionFormPage({
  params,
}: {
  params: { visitId: string };
}) {
  const { hospitalId } = await requireSession(['FRONT_DESK']);

  const [visit, hospital] = await Promise.all([
    loadPrescriptionForm(hospitalId, params.visitId),
    prisma.hospital.findUniqueOrThrow({
      where: { id: hospitalId },
      select: { name: true, logoUrl: true, address: true, contactPhone: true },
    }),
  ]);

  return (
    <main>
      <header>
        {/* Plain <img>, not next/image -- same rationale as the bill's own
            header (local dev-only storage, arbitrary source). */}
        {hospital.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hospital.logoUrl} alt={hospital.name} style={{ maxHeight: '80px' }} />
        )}
        <h1>{hospital.name}</h1>
        {hospital.address && <p>{hospital.address}</p>}
        {hospital.contactPhone && <p>Phone: {hospital.contactPhone}</p>}
      </header>

      <div className="no-print">
        <PrintButton />
      </div>

      <section>
        <h2>Prescription</h2>
        <dl>
          <dt>Patient</dt>
          <dd>
            {visit.patient.name} ({visit.patient.patientCode})
          </dd>
          <dt>Age / Gender</dt>
          <dd>
            {visit.patient.age} / {visit.patient.gender}
          </dd>
          <dt>Doctor</dt>
          <dd>
            {visit.doctor.name}
            {visit.doctor.department ? ` — ${visit.doctor.department}` : ''}
          </dd>
          <dt>Date</dt>
          <dd>{visit.visitDate.toLocaleDateString()}</dd>
          {visit.tokenNumber && (
            <>
              <dt>Token #</dt>
              <dd>{visit.tokenNumber}</dd>
            </>
          )}
        </dl>

        {/* Deliberately blank -- the doctor hand-writes the diagnosis and
            medicines here, then this same page is photographed/scanned and
            uploaded through the existing doctor prescription-upload flow. */}
        <div className="prescription-writing-area" aria-hidden="true" />
      </section>
    </main>
  );
}
