const STATUS_TONE: Record<string, string> = {
  // VisitStatus
  WAITING: 'badge-warning',
  IN_CONSULTATION: 'badge-info',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-neutral',
  // PrescriptionStatus
  UPLOADED: 'badge-info',
  DISPENSED: 'badge-success',
  SUPERSEDED: 'badge-neutral',
  // PaymentStatus
  PENDING: 'badge-warning',
  PAID: 'badge-success',
  // User active status (src/app/admin/users)
  Active: 'badge-success',
  Deactivated: 'badge-neutral',
  // Inventory flags (src/app/pharmacy/inventory, src/inventory/status.ts)
  'LOW STOCK': 'badge-warning',
  EXPIRED: 'badge-danger',
  'EXPIRES SOON': 'badge-warning',
};

// Small presentational component shared across every screen that renders a
// visit/prescription/payment status, inventory flag, or user active state,
// so the color mapping lives in one place instead of copy-pasted per page.
export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'badge-neutral';
  return <span className={`badge ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}
