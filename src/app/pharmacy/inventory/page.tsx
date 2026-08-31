import Link from 'next/link';

import { listMedicines } from '@/inventory';
import { formatISTDate, requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { StatusBadge } from '@/app/components/StatusBadge';

import { addMedicineStockAction, setMedicineActiveAction } from './actions';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string; sid?: string };
}) {
  const { hospitalId } = await requireSession(['PHARMACIST']);

  // includeInactive: true -- unlike every other listMedicines caller
  // (dispense/counter-sale catalogs, low-stock alerts), this screen is
  // where a deactivated medicine needs to still be visible, so staff can
  // reactivate it.
  const medicines = await withHospitalContext(hospitalId, (tx) =>
    listMedicines(tx, hospitalId, { includeInactive: true }),
  );

  return (
    <main>
      <h1>Inventory</h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Stock</th>
              <th>Reorder level</th>
              <th>Unit price</th>
              <th>Expiry</th>
              <th>Flags</th>
              <th>Status</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {medicines.length === 0 && (
              <tr>
                <td colSpan={9}>No medicines in inventory.</td>
              </tr>
            )}
            {medicines.map((medicine) => (
              <tr key={medicine.id} className={medicine.isActive ? undefined : 'muted-section'}>
                <td>{medicine.name}</td>
                <td>{medicine.stockQuantity}</td>
                <td>{medicine.reorderLevel}</td>
                <td>₹{(medicine.unitPriceCents / 100).toFixed(2)}</td>
                <td>{medicine.expiryDate ? formatISTDate(medicine.expiryDate) : '—'}</td>
                <td>
                  {medicine.isLowStock && <StatusBadge status="LOW STOCK" />}{' '}
                  {medicine.isExpired && <StatusBadge status="EXPIRED" />}{' '}
                  {medicine.isNearExpiry && <StatusBadge status="EXPIRES SOON" />}
                </td>
                <td>
                  <StatusBadge status={medicine.isActive ? 'Active' : 'Deactivated'} />
                </td>
                <td>
                  <Link href={`/pharmacy/inventory/${medicine.id}/edit`}>Edit</Link>
                </td>
                <td>
                  <form action={setMedicineActiveAction}>
                    <input type="hidden" name="medicineId" value={medicine.id} />
                    <input
                      type="hidden"
                      name="isActive"
                      value={medicine.isActive ? 'false' : 'true'}
                    />
                    <button type="submit">{medicine.isActive ? 'Deactivate' : 'Reactivate'}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Add stock</h2>
        <p>
          Adding a medicine with the same name as an existing entry adds to its stock instead of
          creating a duplicate; a new name creates a new entry.
        </p>
        <form key={searchParams.sid ?? 'idle'} action={addMedicineStockAction}>
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <label>
            Unit price (₹)
            <input type="number" name="unitPriceRupees" min={0} step="0.01" required />
          </label>
          <label>
            Quantity to add
            <input type="number" name="quantity" min={1} step="1" required />
          </label>
          <button type="submit">Add stock</button>
        </form>
      </section>
    </main>
  );
}
