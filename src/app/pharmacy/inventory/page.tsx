import { listMedicines } from '@/inventory';
import { requireSession, withHospitalContext } from '@/shared';

import { StatusBadge } from '@/app/components/StatusBadge';

export default async function InventoryPage() {
  const { hospitalId } = await requireSession(['PHARMACIST']);

  const medicines = await withHospitalContext(hospitalId, (tx) => listMedicines(tx, hospitalId));

  return (
    <main>
      <h1>Inventory</h1>
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
            </tr>
          </thead>
          <tbody>
            {medicines.length === 0 && (
              <tr>
                <td colSpan={6}>No medicines in inventory.</td>
              </tr>
            )}
            {medicines.map((medicine) => (
              <tr key={medicine.id}>
                <td>{medicine.name}</td>
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
    </main>
  );
}
