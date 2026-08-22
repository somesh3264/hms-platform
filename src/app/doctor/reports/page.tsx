import type { CounterSaleRevenue, RevenueSummary } from '@/reporting';
import { getCounterSaleRevenue, getRevenueSummary } from '@/reporting';
import {
  getISTDayBoundsUTC,
  getISTMonthBoundsUTC,
  requireSession,
  withHospitalContext,
} from '@/shared';

function formatRupees(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

// Doctor-only reporting screen (BRS FR-9's first piece -- see CLAUDE.md).
// Scoped to the logged-in doctor's own visits/bills, same as their home
// screen, not a hospital-wide view -- except for the Counter Sale figures
// (see getCounterSaleRevenue), which are hospital-wide by necessity, since
// a counter sale has no doctor to scope to. Shown here anyway, clearly
// labeled, so a doctor isn't left wondering where that revenue went.
export default async function DoctorReportsPage() {
  const { hospitalId, actorId: doctorId } = await requireSession(['DOCTOR']);

  const today = getISTDayBoundsUTC();
  const month = getISTMonthBoundsUTC();

  const { todaySummary, monthSummary, todayCounterSale, monthCounterSale } =
    await withHospitalContext(hospitalId, async (tx) => {
      const [todaySummary, monthSummary, todayCounterSale, monthCounterSale] = await Promise.all([
        getRevenueSummary(tx, { hospitalId, doctorId, from: today.start, to: today.end }),
        getRevenueSummary(tx, { hospitalId, doctorId, from: month.start, to: month.end }),
        getCounterSaleRevenue(tx, { hospitalId, from: today.start, to: today.end }),
        getCounterSaleRevenue(tx, { hospitalId, from: month.start, to: month.end }),
      ]);
      return { todaySummary, monthSummary, todayCounterSale, monthCounterSale };
    });

  return (
    <main>
      <h1>Reports</h1>
      <RevenuePeriodSection title="Today" summary={todaySummary} counterSale={todayCounterSale} />
      <RevenuePeriodSection
        title="This month"
        summary={monthSummary}
        counterSale={monthCounterSale}
      />
    </main>
  );
}

function RevenuePeriodSection({
  title,
  summary,
  counterSale,
}: {
  title: string;
  summary: RevenueSummary;
  counterSale: CounterSaleRevenue;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <dl>
        <dt>Patients seen</dt>
        <dd>{summary.distinctPatientsCount}</dd>
        <dt>Visits</dt>
        <dd>{summary.visitsCount}</dd>
        <dt>Revenue collected</dt>
        <dd>{formatRupees(summary.totalRevenueCents)}</dd>
      </dl>

      <h3>Fee breakdown</h3>
      <p>
        Revenue collected above is the final amount paid; this breakdown is by billed item, before
        any discount or tax adjustment.
      </p>
      <dl>
        <dt>Consultation fee</dt>
        <dd>{formatRupees(summary.consultationFeeCents)}</dd>
        <dt>Other charges</dt>
        <dd>{formatRupees(summary.otherFeeCents)}</dd>
        <dt>Medicines dispensed</dt>
        <dd>{formatRupees(summary.medicineCents)}</dd>
      </dl>

      <h3>By payment method</h3>
      <dl>
        <dt>Cash</dt>
        <dd>{formatRupees(summary.byPaymentMethod.CASH)}</dd>
        <dt>UPI</dt>
        <dd>{formatRupees(summary.byPaymentMethod.UPI)}</dd>
        <dt>Card</dt>
        <dd>{formatRupees(summary.byPaymentMethod.CARD)}</dd>
      </dl>

      <h3>Counter Sale (whole hospital, not just your own patients)</h3>
      <p>
        Medicine sold directly at the pharmacy counter with no doctor visit involved -- not
        attributable to any doctor, shown here for visibility only.
      </p>
      <dl>
        <dt>Sales</dt>
        <dd>{counterSale.salesCount}</dd>
        <dt>Revenue collected</dt>
        <dd>{formatRupees(counterSale.totalRevenueCents)}</dd>
        <dt>Cash</dt>
        <dd>{formatRupees(counterSale.byPaymentMethod.CASH)}</dd>
        <dt>UPI</dt>
        <dd>{formatRupees(counterSale.byPaymentMethod.UPI)}</dd>
        <dt>Card</dt>
        <dd>{formatRupees(counterSale.byPaymentMethod.CARD)}</dd>
      </dl>
    </section>
  );
}
