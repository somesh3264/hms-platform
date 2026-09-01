import { listMedicines, searchMedicines } from '@/inventory';
import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { StatusBadge } from '@/app/components/StatusBadge';

import { adjustMedicineStockAction } from './actions';

// Corrects a medicine's stock count to match a physical count on the shelf
// (see adjustMedicineStock, src/inventory/adjust.ts) -- a separate,
// HOSPITAL_ADMIN-only screen from /pharmacy/inventory (PHARMACIST-gated),
// not an addition to it: an unaudited-looking write straight to the stock
// count needs to sit with the role positioned to ask "why" a mismatch
// happened, not the role that might be the reason for it. Deliberately
// minimal -- no rename/deactivate/add-stock controls here, those already
// exist on the pharmacist's own inventory screen; this page does exactly
// one thing.
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: { medQuery?: string; success?: string; error?: string; sid?: string };
}) {
  const { hospitalId } = await requireSession(['HOSPITAL_ADMIN']);
  const medQuery = searchParams.medQuery?.trim() ?? '';

  // includeInactive: true, same reasoning as the pharmacist's own inventory
  // screen -- a deactivated medicine can still have a real physical count
  // that needs correcting. Same medQuery-driven search/full-list split as
  // the pharmacy dispense screens (searchMedicines already does a
  // case-insensitive partial/substring match on name) -- there's no
  // client-side JS anywhere in this app (see CLAUDE.md), so results update
  // on search submit, not live as the admin types.
  const medicines = await withHospitalContext(hospitalId, (tx) =>
    medQuery
      ? searchMedicines(tx, { hospitalId, query: medQuery, includeInactive: true })
      : listMedicines(tx, hospitalId, { includeInactive: true }),
  );

  return (
    <main>
      <h1>Stock Adjustments</h1>
      <p>
        Corrects the system&apos;s stock count to match what&apos;s actually on the shelf -- for a
        physical count mismatch, not a sale. Every correction requires a reason and is recorded in
        the audit log.
      </p>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <form method="get">
        <input
          type="text"
          name="medQuery"
          defaultValue={medQuery}
          placeholder="Search medicines by name"
        />
        <button type="submit">Search</button>
      </form>

      <section>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Current stock</th>
              <th>Status</th>
              <th>Correct to</th>
            </tr>
          </thead>
          <tbody>
            {medicines.length === 0 && (
              <tr>
                <td colSpan={4}>
                  {medQuery ? 'No matching medicines.' : 'No medicines in inventory.'}
                </td>
              </tr>
            )}
            {medicines.map((medicine) => (
              <tr key={medicine.id} className={medicine.isActive ? undefined : 'muted-section'}>
                <td>{medicine.name}</td>
                <td>{medicine.stockQuantity}</td>
                <td>
                  <StatusBadge status={medicine.isActive ? 'Active' : 'Deactivated'} />
                </td>
                <td>
                  <form
                    key={searchParams.sid ?? 'idle'}
                    action={adjustMedicineStockAction}
                    className="inline-fields"
                  >
                    <input type="hidden" name="medicineId" value={medicine.id} />
                    <input type="hidden" name="medQuery" value={medQuery} />
                    <input type="number" name="quantity" min={0} step="1" required />
                    <input type="text" name="reason" placeholder="Reason" required />
                    <button type="submit">Correct</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
