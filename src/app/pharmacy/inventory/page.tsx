import { listMedicines } from '@/inventory';
import { requireSession, withHospitalContext } from '@/shared';

import { FlashMessage } from '@/app/components/FlashMessage';
import { StatusBadge } from '@/app/components/StatusBadge';

import { addMedicineStockAction } from './actions';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string; sid?: string };
}) {
  const { hospitalId } = await requireSession(['PHARMACIST']);

  const medicines = await withHospitalContext(hospitalId, (tx) => listMedicines(tx, hospitalId));

  return (
    <main>
      <h1>Inventory</h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Batch</th>
              <th>Stock</th>
              <th>Reorder level</th>
              <th>Unit price</th>
              <th>Expiry</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {medicines.length === 0 && (
              <tr>
                <td colSpan={7}>No medicines in inventory.</td>
              </tr>
            )}
            {medicines.map((medicine) => (
              <tr key={medicine.id}>
                <td>{medicine.name}</td>
                <td>{medicine.batchNumber ?? '—'}</td>
                <td>{medicine.stockQuantity}</td>
                <td>{medicine.reorderLevel}</td>
                <td>₹{(medicine.unitPriceCents / 100).toFixed(2)}</td>
                <td>{medicine.expiryDate ? medicine.expiryDate.toLocaleDateString() : '—'}</td>
                <td>
                  {medicine.isLowStock && <StatusBadge status="LOW STOCK" />}{' '}
                  {medicine.isExpired && <StatusBadge status="EXPIRED" />}{' '}
                  {medicine.isNearExpiry && <StatusBadge status="EXPIRES SOON" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Add stock</h2>
        <p>
          Adding a medicine with the same name and batch number as an existing entry adds to its
          stock instead of creating a duplicate; a new name (or batch) creates a new entry.
        </p>
        <form key={searchParams.sid ?? 'idle'} action={addMedicineStockAction}>
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <label>
            Batch number (optional)
            <input type="text" name="batchNumber" />
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
