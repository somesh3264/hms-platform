import type { Metadata } from 'next';

import { formatISTDate, prisma, requireSession, withHospitalContext } from '@/shared';

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
// registration number on the right, a full-width rule, a left sidebar
// listing every doctor at the practice (a static roster on the real paper,
// same on every sheet regardless of who's actually seeing this particular
// patient) in the same name-dark/department-muted style as the photo, and
// patient details filled in above the blank writing area, which itself
// carries a faint hospital logo watermark, matching the photo's own
// letterhead-stamp-in-the-background look. The disclaimer line's exact
// wording (currently 15 days) was corrected per the hospital's own
// instruction, not re-copied from the photo.
//
// The sidebar deliberately does *not* distinguish the doctor actually
// assigned to this visit from the other two -- an earlier version bolded
// them differently to make that unambiguous, but the hospital asked to
// keep this simple, matching the plain static roster the real paper shows.
//
// Fetches the visit and the full doctor roster in the same transaction --
// `users` is RLS-protected same as every other tenant-owned table, so the
// roster query has to run through this same withHospitalContext (a plain
// `prisma.user.findMany` outside of it would silently come back empty, not
// throw, since the RLS policy fails closed with no app.current_hospital_id
// session variable set).
async function loadPrescriptionForm(hospitalId: string, visitId: string) {
  return withHospitalContext(hospitalId, async (tx) => {
    const visit = await tx.visit.findFirstOrThrow({
      where: { id: visitId, hospitalId },
      select: {
        id: true,
        visitDate: true,
        tokenNumber: true,
        patient: { select: { name: true, patientCode: true, age: true, gender: true } },
      },
    });
    const doctors = await tx.user.findMany({
      where: { hospitalId, role: 'DOCTOR', isActive: true },
      select: { id: true, name: true, department: true },
      orderBy: { name: 'asc' },
    });
    return { visit, doctors };
  });
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
  const { visit } = await loadPrescriptionForm(hospitalId, params.visitId);
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

  const [{ visit, doctors }, hospital] = await Promise.all([
    loadPrescriptionForm(hospitalId, params.visitId),
    prisma.hospital.findUniqueOrThrow({
      where: { id: hospitalId },
      select: { name: true, logoUrl: true, address: true, registrationNumber: true },
    }),
  ]);

  return (
    <main className="prescription-form-page">
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

        <div className="letterhead-body">
          <aside className="letterhead-sidebar">
            {doctors.map((doctor) => (
              <div key={doctor.id} className="letterhead-sidebar-doctor">
                <strong>{doctor.name}</strong>
                {doctor.department && <div>{doctor.department}</div>}
              </div>
            ))}
          </aside>

          <div className="letterhead-content">
            <div className="letterhead-patient-row">
              <span>
                Pt. Name: <strong>{visit.patient.name}</strong> ({visit.patient.patientCode})
              </span>
              <span>
                Age/Sex: <strong>{visit.patient.age}/{visit.patient.gender}</strong>
              </span>
              <span>
                Date: <strong>{formatISTDate(visit.visitDate)}</strong>
              </span>
              {visit.tokenNumber && (
                <span>
                  Token #: <strong>{visit.tokenNumber}</strong>
                </span>
              )}
            </div>

            {/* Deliberately blank aside from the watermark -- the doctor
                hand-writes the diagnosis and medicines here, then this
                same page is photographed/scanned and uploaded through the
                existing doctor prescription-upload flow. The watermark is
                the same logo file used in the header above (already the
                combined "hospital name arc + circular mark" letterhead
                asset, not a separate name-only graphic), faded via CSS
                rather than a second uploaded image. */}
            <div className="prescription-writing-area" aria-hidden="true">
              {hospital.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hospital.logoUrl}
                  alt=""
                  className="prescription-writing-area-watermark"
                />
              )}
            </div>
          </div>
        </div>

        <p className="letterhead-footer">Disclaimer: this prescription is valid for 15 days</p>
      </div>
    </main>
  );
}
