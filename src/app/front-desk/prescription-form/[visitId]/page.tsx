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
// This page only ever reads Patient/Visit/Hospital/User data that already
// exists; it creates nothing.
//
// Layout modeled directly on a photo of the hospital's actual pre-printed
// letterhead (a later, explicitly requested reference, not guessed at):
// logo + hospital name/address across the top over a full-width rule, a
// left sidebar listing every doctor at the practice (a static roster on
// the real paper, same on every sheet regardless of who's actually seeing
// this particular patient), and the patient's name/age-sex/date filled in
// at the top of the right-hand writing area. The roster is real data here
// (every active DOCTOR-role user), not hardcoded -- the one addition beyond
// a literal copy is bolding the doctor actually assigned to this visit, so
// it's unambiguous which one of possibly several doctors this printout is
// for, since the physical version relies on staff already knowing that
// from context. The "valid for 10 days" line is copied verbatim from the
// same photo -- an existing clinical/business policy of this hospital's,
// not something invented here.
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
        doctor: { select: { id: true, name: true, department: true } },
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
      select: { name: true, logoUrl: true, address: true },
    }),
  ]);

  return (
    <main>
      <div className="no-print">
        <PrintButton />
      </div>

      <div className="letterhead">
        <div className="letterhead-header">
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

        <div className="letterhead-rule" />

        <div className="letterhead-body">
          <aside className="letterhead-sidebar">
            {doctors.map((doctor) => (
              <div
                key={doctor.id}
                className={
                  doctor.id === visit.doctor.id
                    ? 'letterhead-sidebar-doctor letterhead-sidebar-doctor-assigned'
                    : 'letterhead-sidebar-doctor'
                }
              >
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
                Date: <strong>{visit.visitDate.toLocaleDateString()}</strong>
              </span>
              {visit.tokenNumber && (
                <span>
                  Token #: <strong>{visit.tokenNumber}</strong>
                </span>
              )}
            </div>

            {/* Deliberately blank -- the doctor hand-writes the diagnosis
                and medicines here, then this same page is
                photographed/scanned and uploaded through the existing
                doctor prescription-upload flow. */}
            <div className="prescription-writing-area" aria-hidden="true" />
          </div>
        </div>

        <p className="letterhead-footer">DISCLAIMER: THE PRESCRIPTION IS VALID FOR 10 DAYS</p>
      </div>
    </main>
  );
}
