import Link from 'next/link';

import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';

import { updateMedicineDetailsAction } from './actions';

// A dedicated page rather than the inline per-row rename form the
// inventory table used to have -- a later, explicitly requested redesign:
// a text input baked into every row (just for the name) already looked
// cluttered, and editing multiple fields (name, price, reorder level)
// inline in a table cell doesn't fit any better than front desk's own
// multi-charge form did (see /front-desk/bill/[visitId] for that same
// reasoning). Deliberately not the full field set Medicine supports (salt
// composition, expiry, low-stock threshold override) -- those were already
// cut from the "Add stock" form at pharmacy staff's own request; same
// reasoning applies here.
export default async function EditMedicinePage({
  params,
  searchParams,
}: {
  params: { medicineId: string };
  searchParams: { success?: string; error?: string };
}) {
  const { hospitalId } = await requireSession(['PHARMACIST']);

  const medicine = await withHospitalContext(hospitalId, (tx) =>
    tx.medicine.findFirstOrThrow({
      where: { id: params.medicineId, hospitalId },
      select: { id: true, name: true, unitPriceCents: true, reorderLevel: true },
    }),
  );

  return (
    <main>
      <h1>Edit medicine</h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <form action={updateMedicineDetailsAction}>
          <input type="hidden" name="medicineId" value={medicine.id} />
          <label>
            Name
            <input type="text" name="name" defaultValue={medicine.name} required />
          </label>
          <label>
            Unit price (₹)
            <input
              type="number"
              name="unitPriceRupees"
              min={0}
              step="0.01"
              defaultValue={(medicine.unitPriceCents / 100).toFixed(2)}
              required
            />
          </label>
          <label>
            Reorder level
            <input
              type="number"
              name="reorderLevel"
              min={0}
              step="1"
              defaultValue={medicine.reorderLevel}
              required
            />
          </label>
          <button type="submit">Save changes</button>
        </form>
      </section>

      <p>
        <Link href="/pharmacy/inventory">Back to Inventory</Link>
      </p>
    </main>
  );
}
