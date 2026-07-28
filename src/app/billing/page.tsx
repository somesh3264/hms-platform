import Link from 'next/link';

import { listVisitsReadyToBill, searchBills } from '@/billing';
import { requireSession, withHospitalContext } from '@/shared';

import { StatusBadge } from '@/app/components/StatusBadge';

export default async function BillingPage({ searchParams }: { searchParams: { q?: string } }) {
  const { hospitalId } = await requireSession(['PHARMACIST']);
  const query = searchParams.q?.trim() ?? '';

  const { readyToBill, bills } = await withHospitalContext(hospitalId, async (tx) => {
    const readyToBill = await listVisitsReadyToBill(tx, hospitalId);
    const bills = query ? await searchBills(tx, { hospitalId, query }) : [];
    return { readyToBill, bills };
  });

  return (
    <main>
      <h1>Billing</h1>

      <section>
        <h2>Ready to bill</h2>
        {readyToBill.length === 0 ? (
          <p>No visits with dispensed items awaiting a bill.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Department</th>
                <th>Visit date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {readyToBill.map((visit) => (
                <tr key={visit.id}>
                  <td>
                    {visit.patient.firstName} {visit.patient.lastName} ({visit.patient.patientCode})
                  </td>
                  <td>{visit.department ?? '—'}</td>
                  <td>{visit.visitDate.toLocaleDateString()}</td>
                  <td>
                    <Link href={`/billing/new/${visit.id}`}>Generate bill</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Billing history</h2>
        <form method="get">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Patient name, ID, or bill number"
          />
          <button type="submit">Search</button>
        </form>

        {query && (
          <table>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Patient</th>
                <th>Total</th>
                <th>Status</th>
                <th>Issued</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 && (
                <tr>
                  <td colSpan={6}>No matching bills.</td>
                </tr>
              )}
              {bills.map((bill) => (
                <tr key={bill.id}>
                  <td>{bill.billNumber}</td>
                  <td>
                    {bill.patient.firstName} {bill.patient.lastName}
                  </td>
                  <td>₹{(bill.totalCents / 100).toFixed(2)}</td>
                  <td>
                    <StatusBadge status={bill.paymentStatus} />
                  </td>
                  <td>{bill.issuedAt?.toLocaleDateString() ?? '—'}</td>
                  <td>
                    <Link href={`/billing/${bill.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
