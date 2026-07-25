import type { Hospital, Medicine } from '@prisma/client';

const NEAR_EXPIRY_WINDOW_DAYS = 30;

// FR-6.6/6.7: low-stock when remaining stock falls to/below a threshold
// percentage of the medicine's reorder level. The threshold is configurable
// per hospital (Hospital.lowStockThresholdPercent, default 30%) and
// overridable per medicine (Medicine.lowStockThresholdPercent). If no
// reorder level is set for a medicine, the only thing this can detect is
// being fully out of stock (0 * any% = 0).
export function isLowStock(
  medicine: Pick<Medicine, 'stockQuantity' | 'reorderLevel' | 'lowStockThresholdPercent'>,
  hospital: Pick<Hospital, 'lowStockThresholdPercent'>,
): boolean {
  const thresholdPercent = medicine.lowStockThresholdPercent ?? hospital.lowStockThresholdPercent;
  const threshold = medicine.reorderLevel * (thresholdPercent / 100);
  return medicine.stockQuantity <= threshold;
}

// FR-6.9: flag near-expiry medicines. Also reports already-expired stock
// separately, since that's a stronger signal than "expiring soon".
export function getExpiryStatus(
  medicine: Pick<Medicine, 'expiryDate'>,
  now: Date = new Date(),
): { isExpired: boolean; isNearExpiry: boolean } {
  if (!medicine.expiryDate) {
    return { isExpired: false, isNearExpiry: false };
  }
  const isExpired = medicine.expiryDate.getTime() < now.getTime();
  const windowEnd = now.getTime() + NEAR_EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const isNearExpiry = !isExpired && medicine.expiryDate.getTime() <= windowEnd;
  return { isExpired, isNearExpiry };
}
