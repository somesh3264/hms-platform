import Link from 'next/link';

import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';

import { updatePatientAction } from './actions';

// Wires up updatePatientDemographics (src/patients/update.ts), which
// already existed with full validation but had no UI calling it -- same
// "missing write path" shape as addMedicineStock before /pharmacy/inventory
// existed. A dedicated page rather than inline editing on the shared
// /patients/[patientId] longitudinal view, mirroring
// /pharmacy/inventory/[medicineId]/edit's own reasoning -- and FRONT_DESK
// gated specifically (a later, explicitly requested scope), since front
// desk owns patient registration/demographics, unlike that longitudinal
// view itself which is open to any authenticated role. Deliberately not
// the full field set Patient supports (email, consent, medical history
// notes) -- only name/age/gender/phone/address, per explicit request.
export default async function EditPatientPage({
  params,
  searchParams,
}: {
  params: { patientId: string };
  searchParams: { success?: string; error?: string };
}) {
  const { hospitalId } = await requireSession(['FRONT_DESK']);

  const patient = await withHospitalContext(hospitalId, (tx) =>
    tx.patient.findFirstOrThrow({
      where: { id: params.patientId, hospitalId },
      select: { id: true, name: true, age: true, gender: true, phone: true, address: true },
    }),
  );

  return (
    <main>
      <h1>Edit patient</h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <form action={updatePatientAction}>
          <input type="hidden" name="patientId" value={patient.id} />
          <label>
            Name
            <input type="text" name="name" defaultValue={patient.name} required />
          </label>
          <label>
            Age
            <input
              type="text"
              name="age"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={patient.age}
              required
            />
          </label>
          <label>
            Gender
            <select name="gender" defaultValue={patient.gender}>
              <option value="UNKNOWN">Unknown</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Phone
            <input
              type="tel"
              name="phone"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              title="10-digit phone number"
              defaultValue={patient.phone ?? ''}
              required
            />
          </label>
          <label>
            Address
            <input type="text" name="address" defaultValue={patient.address ?? ''} />
          </label>
          <button type="submit">Save changes</button>
        </form>
      </section>

      <p>
        <Link href={`/patients/${patient.id}`}>Back to patient record</Link>
      </p>
    </main>
  );
}
