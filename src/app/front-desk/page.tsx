import { searchPatients } from '@/patients';
import { requireSession, withHospitalContext } from '@/shared';
import { listWaitingQueue } from '@/visits';

import { FlashMessage } from '@/app/components/FlashMessage';

import { createVisitAction, registerPatientAction } from './actions';

// Local-time "YYYY-MM-DD" / "HH:mm" defaultValues for the separate
// appointment date and time <input>s (split from one datetime-local field
// since that combined picker made the time easy to miss) -- local wall-clock
// time, same as how the browser will hand them back on submit.
function toDateOnlyValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeOnlyValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Native <input type="date"> pickers make the year hard to reach for a
// birth date decades in the past (it's buried behind a small stepper, or
// requires clicking back one month at a time) -- three plain <select>s let
// staff jump straight to the year.
function DateOfBirthFields() {
  const currentYear = new Date().getFullYear();
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const years = Array.from({ length: 121 }, (_, i) => currentYear - i);

  return (
    <div className="inline-fields">
      <label>
        Day
        <select name="dobDay" required defaultValue="">
          <option value="" disabled>
            Day
          </option>
          {days.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </label>
      <label>
        Month
        <select name="dobMonth" required defaultValue="">
          <option value="" disabled>
            Month
          </option>
          {MONTHS.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </select>
      </label>
      <label>
        Year
        <select name="dobYear" required defaultValue="">
          <option value="" disabled>
            Year
          </option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
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
  const nowDate = toDateOnlyValue(new Date());
  const nowTime = toTimeOnlyValue(new Date());

  const { searchResults, queue, doctors } = await withHospitalContext(hospitalId, async (tx) => {
    const searchResults = query ? await searchPatients(tx, { hospitalId, query }) : [];
    const queue = await listWaitingQueue(tx, { hospitalId });
    const doctors = await tx.user.findMany({
      where: { hospitalId, role: 'DOCTOR', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { searchResults, queue, doctors };
  });

  return (
    <main>
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
                  <td>
                    {patient.firstName} {patient.lastName}
                  </td>
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
                      <input type="text" name="department" placeholder="Department (optional)" />
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
            First name
            <input type="text" name="firstName" required />
          </label>
          <label>
            Last name
            <input type="text" name="lastName" required />
          </label>
          <label>Date of birth</label>
          <DateOfBirthFields />
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
            <input type="tel" name="phone" />
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
            Assign doctor (optional — creates today&apos;s visit immediately)
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
              <th>Department</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {queue.length === 0 && (
              <tr>
                <td colSpan={5}>No patients waiting.</td>
              </tr>
            )}
            {queue.map((visit) => (
              <tr key={visit.id}>
                <td>{visit.tokenNumber ?? '—'}</td>
                <td>
                  {visit.patient.firstName} {visit.patient.lastName} ({visit.patient.patientCode})
                </td>
                <td>{visit.doctor.name}</td>
                <td>{visit.department ?? '—'}</td>
                <td>{visit.visitDate.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
