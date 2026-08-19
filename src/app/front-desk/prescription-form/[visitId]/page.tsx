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
//
// Layout modeled on a photo of the hospital's actual pre-printed
// letterhead: logo + hospital name/address on the left of the header,
// registration number on the right, a full-width rule, then the assigned
// doctor and patient details filled in above the blank writing area. An
// earlier version of this page also reproduced the photo's left sidebar
// listing every doctor at the practice -- removed at the hospital's
// explicit request, since this practice only has the one doctor and the
// sidebar (and its dividing border) had nothing to distinguish. The
// disclaimer line's exact wording was also corrected per the hospital's
// own instruction, not re-copied from the photo.
async function loadVisit(hospitalId: string, visitId: string) {
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
  const visit = await loadVisit(hospitalId, params.visitId);
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
    loadVisit(hospitalId, params.visitId),
    prisma.hospital.findUniqueOrThrow({
      where: { id: hospitalId },
      select: { name: true, logoUrl: true, address: true, registrationNumber: true },
    }),
  ]);

  return (
    <main>
      <div className="no-print">
        <PrintButton />
      </div>

      <div className="letterhead">
        <div className="letterhead-header">
          <div className="letterhead-header-left">
            {/* Plain <img>, not next/image -- same rationale as the bill's
                own header (local dev-only storage, arbitrary source). */}
            {hospital.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hospital.logoUrl} alt={hospital.name} className="letterhead-logo" />
            )}
            <div>
              <h1>{hospital.name}</h1>
              {hospital.address && <p>Address: {hospital.address}</p>}
            </div>
          </div>
          {hospital.registrationNumber && (
            <p className="letterhead-registration">Registration no: {hospital.registrationNumber}</p>
          )}
        </div>

        <div className="letterhead-rule" />

        <div className="letterhead-content">
          <div className="letterhead-patient-row">
            <span>
              Pt. Name: <strong>{visit.patient.name}</strong> ({visit.patient.patientCode})
            </span>
            <span>
              Age/Sex: <strong>{visit.patient.age}/{visit.patient.gender}</strong>
            </span>
            <span>
              Date: <strong>{visit.visitDate.toLocaleDateString()}</strong>
            </span>
            {visit.tokenNumber && (
              <span>
                Token #: <strong>{visit.tokenNumber}</strong>
              </span>
            )}
          </div>
          <div className="letterhead-patient-row">
            <span>
              Doctor: <strong>{visit.doctor.name}</strong>
              {visit.doctor.department ? ` — ${visit.doctor.department}` : ''}
            </span>
          </div>

          {/* Deliberately blank -- the doctor hand-writes the diagnosis
              and medicines here, then this same page is
              photographed/scanned and uploaded through the existing
              doctor prescription-upload flow. */}
          <div className="prescription-writing-area" aria-hidden="true" />
        </div>

        <p className="letterhead-footer">Disclaimer: this prescription is valid for 10 days</p>
      </div>
    </main>
  );
}
