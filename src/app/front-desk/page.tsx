import Link from 'next/link';

import { searchPatients } from '@/patients';
import {
  getISTDayBoundsUTC,
  getISTNowDateTimeStrings,
  prisma,
  requireSession,
  withHospitalContext,
} from '@/shared';
import { listRecentlyCompletedVisits, listWaitingQueue } from '@/visits';

import { FlashMessage } from '@/app/components/FlashMessage';
import { StatusBadge } from '@/app/components/StatusBadge';
import { UpiQrCode } from '@/app/components/UpiQrCode';

import { collectConsultationFeeAction, createVisitAction, registerPatientAction } from './actions';

// Shared by every place the consultation fee is collected (walk-in
// registration, "Create visit", and the waiting-queue "collect on arrival"
// form) -- fee/discount in rupees (same convention as the billing module's
// discount field, not a percentage), payment method one of the three the
// front desk actually takes at the counter.
function ConsultationFeeFields({
  required = false,
  upiQrCodeUrl,
}: {
  required?: boolean;
  upiQrCodeUrl: string | null;
}) {
  return (
    <div className="inline-fields">
      <label>
        Consultation fee (₹)
        <input
          type="text"
          name="consultationFeeRupees"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          required={required}
        />
      </label>
      <label>
        Referral discount (₹)
        <input type="number" name="discountRupees" min={0} step="0.01" defaultValue={0} />
      </label>
      <label>
        Payment method
        <select name="paymentMethod" defaultValue="" required={required}>
          <option value="" disabled>
            Select…
          </option>
          <option value="CASH">Cash</option>
          <option value="UPI">UPI</option>
          <option value="CARD">Card</option>
        </select>
      </label>
      <UpiQrCode url={upiQrCodeUrl} />
    </div>
  );
}

export default async function FrontDeskPage({
  searchParams,
}: {
  searchParams: { q?: string; success?: string; error?: string; sid?: string };
}) {
  const { hospitalId } = await requireSession(['FRONT_DESK']);
  const query = searchParams.q?.trim() ?? '';
  // IST wall-clock "now", not the server's own local time -- the
  // production Docker container runs in UTC with no TZ configured, so
  // plain Date getters here previously showed a stale past date/time on
  // this exact form in production (see src/shared/ist-date.ts).
  const { dateOnly: nowDate, timeOnly: nowTime } = getISTNowDateTimeStrings();

  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { upiQrCodeUrl: true },
  });

  const { searchResults, queue, recentlyCompleted, doctors } = await withHospitalContext(
    hospitalId,
    async (tx) => {
      const searchResults = query ? await searchPatients(tx, { hospitalId, query }) : [];
      const queue = await listWaitingQueue(tx, { hospitalId });
      const recentlyCompleted = await listRecentlyCompletedVisits(tx, {
        hospitalId,
        since: getISTDayBoundsUTC().start,
      });
      const doctors = await tx.user.findMany({
        where: { hospitalId, role: 'DOCTOR', isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return { searchResults, queue, recentlyCompleted, doctors };
    },
  );

  return (
    <main>
      {/* Deliberately no auto-refresh meta tag here, unlike /pharmacy --
          this page has substantial in-progress forms (patient
          registration, fee collection), and a timed reload would silently
          wipe whatever a staff member is mid-typing. Every registration,
          search, and fee collection already reloads this page via its own
          Server Action, so the queue and "Completed today" section stay
          reasonably fresh through normal use without that risk. */}
      <h1>Front Desk</h1>

      <FlashMessage success={searchParams.success} error={searchParams.error} />

      <section>
        <h2>Find a patient</h2>
        <p>Search by name, phone, or patient ID before registering a new patient.</p>
        <form method="get">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Name, phone, or patient ID"
          />
          <button type="submit">Search</button>
        </form>

        {query && (
          <table>
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Create visit</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.length === 0 && (
                <tr>
                  <td colSpan={4}>No matches. Register this patient below.</td>
                </tr>
              )}
              {searchResults.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.patientCode}</td>
                  <td>{patient.name}</td>
                  <td>{patient.phone ?? '—'}</td>
                  <td>
                    <form action={createVisitAction}>
                      <input type="hidden" name="patientId" value={patient.id} />
                      <input type="hidden" name="q" value={query} />
                      <select name="doctorId" required>
                        <option value="">Assign doctor…</option>
                        {doctors.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {doctor.name}
                          </option>
                        ))}
                      </select>
                      <div className="inline-fields">
                        <label>
                          Appointment date
                          <input type="date" name="visitDateOnly" defaultValue={nowDate} required />
                        </label>
                        <label>
                          Appointment time
                          <input type="time" name="visitTimeOnly" defaultValue={nowTime} required />
                        </label>
                      </div>
                      <ConsultationFeeFields upiQrCodeUrl={hospital.upiQrCodeUrl} />
                      <button type="submit">Create visit</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Register new patient</h2>
        <form key={searchParams.sid ?? 'idle'} action={registerPatientAction}>
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <label>
            Age
            <input type="text" name="age" inputMode="numeric" pattern="[0-9]*" required />
          </label>
          <label>
            Gender
            <select name="gender" defaultValue="UNKNOWN">
              <option value="UNKNOWN">Unknown</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Phone
            <input
              type="tel"
              name="phone"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              title="10-digit phone number"
              required
            />
          </label>
          <label>
            Email
            <input type="email" name="email" />
          </label>
          <label>
            Address
            <input type="text" name="address" />
          </label>
          <label>
            <input type="checkbox" name="consentDigitalDelivery" />
            Patient consents to digital delivery of bills/prescriptions
          </label>
          <label>
            Assign doctor
            <select name="doctorId" defaultValue="">
              <option value="">No appointment yet</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-fields">
            <label>
              Appointment date
              <input type="date" name="visitDateOnly" defaultValue={nowDate} />
            </label>
            <label>
              Appointment time
              <input type="time" name="visitTimeOnly" defaultValue={nowTime} />
            </label>
          </div>
          <ConsultationFeeFields upiQrCodeUrl={hospital.upiQrCodeUrl} />
          <button type="submit">Register patient</button>
        </form>
      </section>

      <section>
        <h2>Waiting queue</h2>
        <table>
          <thead>
            <tr>
              <th>Token #</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Since</th>
              <th>Consultation fee</th>
              <th>Other charges</th>
              <th>Prescription form</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 && (
              <tr>
                <td colSpan={7}>No patients waiting.</td>
              </tr>
            )}
            {queue.map((visit) => (
              <tr key={visit.id}>
                <td>{visit.tokenNumber ?? '—'}</td>
                <td>
                  {visit.patient.name} ({visit.patient.patientCode})
                </td>
                <td>{visit.doctor.name}</td>
                <td>{visit.visitDate.toLocaleString()}</td>
                <td>
                  {visit.bills.length > 0 ? (
                    <StatusBadge status="PAID" />
                  ) : (
                    <form action={collectConsultationFeeAction}>
                      <input type="hidden" name="visitId" value={visit.id} />
                      <ConsultationFeeFields required upiQrCodeUrl={hospital.upiQrCodeUrl} />
                      <button type="submit">Collect fee</button>
                    </form>
                  )}
                </td>
                <td>
                  <Link href={`/front-desk/bill/${visit.id}`}>Bill for surgery/procedure</Link>
                </td>
                <td>
                  {/* Reprint access for a visit already past registration --
                      e.g. a booked appointment printed days ago whose paper
                      got lost, or one skipped at registration time. */}
                  <Link href={`/front-desk/prescription-form/${visit.id}`}>Print</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Completed today</h2>
        <p>So you know when a patient&apos;s consultation has just finished.</p>
        {recentlyCompleted.length === 0 ? (
          <p>None completed yet today.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Token #</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Completed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentlyCompleted.map((visit) => (
                <tr key={visit.id}>
                  <td>{visit.tokenNumber ?? '—'}</td>
                  <td>
                    {visit.patient.name} ({visit.patient.patientCode})
                  </td>
                  <td>{visit.doctor.name}</td>
                  <td>{visit.updatedAt.toLocaleString()}</td>
                  <td>
                    <Link href={`/front-desk/bill/${visit.id}`}>Bill for surgery/procedure</Link>
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
