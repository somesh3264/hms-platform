import { prisma, requireSession } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';

import { updateHospitalBrandingAction } from './actions';

// FR-1.2/FR-1.3: lets a Hospital Admin edit the branding fields already on
// the Hospital model (logo, name is fixed, address, contact, GSTIN, theme
// color) instead of leaving them seed-only.
export default async function HospitalSettingsPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string };
}) {
  const { hospitalId } = await requireSession(['HOSPITAL_ADMIN']);

  const hospital = await prisma.hospital.findUniqueOrThrow({ where: { id: hospitalId } });

  return (
    <main>
      <h1>Hospital Settings</h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <p>
        Staff sign in at{' '}
        <code>
          {hospital.subdomain}.{process.env.ROOT_DOMAIN ?? 'localhost'}
        </code>{' '}
        -- contact the platform operator to change this.
      </p>

      <section className="form-narrow">
        <form action={updateHospitalBrandingAction}>
          <label>
            Hospital name
            <input type="text" name="name" defaultValue={hospital.name} required />
          </label>
          <label>
            Address
            <input type="text" name="address" defaultValue={hospital.address ?? ''} />
          </label>
          <label>
            Contact phone
            <input type="tel" name="contactPhone" defaultValue={hospital.contactPhone ?? ''} />
          </label>
          <label>
            Contact email
            <input type="email" name="contactEmail" defaultValue={hospital.contactEmail ?? ''} />
          </label>
          <label>
            GSTIN
            <input type="text" name="gstin" defaultValue={hospital.gstin ?? ''} />
          </label>
          <label>
            Registration number
            <input
              type="text"
              name="registrationNumber"
              defaultValue={hospital.registrationNumber ?? ''}
            />
          </label>
          <label>
            Theme color
            <input type="color" name="themeColor" defaultValue={hospital.themeColor ?? '#2563eb'} />
          </label>
          <label>
            Logo
            {hospital.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hospital.logoUrl} alt={hospital.name} style={{ maxHeight: '60px' }} />
            )}
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" />
          </label>
          <label>
            UPI QR code
            {hospital.upiQrCodeUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hospital.upiQrCodeUrl} alt="UPI QR code" style={{ maxHeight: '160px' }} />
            )}
            <input type="file" name="upiQrCode" accept="image/png,image/jpeg,image/webp" />
          </label>
          <button type="submit">Save</button>
        </form>
      </section>
    </main>
  );
}
