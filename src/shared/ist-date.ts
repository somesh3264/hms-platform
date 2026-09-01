const IST_TIME_ZONE = 'Asia/Kolkata';

// "YYYY-MM-DD" for the given instant's IST calendar date, regardless of the
// server's own timezone. Fixed to IST rather than server-local time since
// this is an Indian-market product (BRS) and day-boundary concepts (the
// daily token reset, FR-3.7/FR-3.8; "today's queue", FR-4.6) must be
// correct even on a server deployed in UTC or any other timezone.
function getISTDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Returns the given instant's IST calendar date as a UTC-midnight Date --
// suitable for a Postgres `@db.Date` column (e.g. 2026-07-28T00:00:00Z
// represents "28 July 2026 in IST"), not for instant/range comparisons
// against a `DateTime` column -- see getISTDayBoundsUTC for that.
export function getISTDateOnly(date: Date = new Date()): Date {
  return new Date(`${getISTDateString(date)}T00:00:00.000Z`);
}

// Returns the [start, end) UTC instant bounds of the given date's IST
// calendar day, for filtering a `DateTime` column to "today (IST)" --
// e.g. FR-4.6's doctor home screen queue. IST has no DST (fixed UTC+5:30
// year-round), so the ISO offset suffix gives an exact instant with no
// manual arithmetic, and end is exactly 24h after start.
export function getISTDayBoundsUTC(date: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(`${getISTDateString(date)}T00:00:00.000+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// "HH:mm" for the given instant's IST wall-clock time, regardless of the
// server's own timezone -- same reasoning as getISTDateString above,
// applied to the time half. hourCycle: 'h23' (not hour12: false) avoids a
// real Intl quirk where midnight can render as "24:00" in some engines.
function getISTTimeString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  return `${get('hour')}:${get('minute')}`;
}

// "YYYY-MM-DD" / "HH:mm" pair for the given instant's IST wall-clock time --
// e.g. front desk's appointment date/time <input> defaults
// (src/app/front-desk/page.tsx), which must show IST "now" even when the
// server itself runs in UTC (as the production Docker container does, with
// no TZ configured) -- using plain `Date` getters there previously showed a
// stale past date/time in production while looking correct in local dev
// (whose server process happens to already run in IST).
export function getISTNowDateTimeStrings(date: Date = new Date()): {
  dateOnly: string;
  timeOnly: string;
} {
  return { dateOnly: getISTDateString(date), timeOnly: getISTTimeString(date) };
}

// Inverse of the pair above: given a "YYYY-MM-DD" date and "HH:mm" time
// that together represent an IST wall-clock moment (e.g. front desk's
// submitted appointment date/time), returns the correct UTC instant.
// `new Date(\`${dateStr}T${timeStr}\`)` (no offset suffix) is parsed as
// *server-local* time, not IST -- the same bug as above, but on the write
// path, where it's worse: it would silently store the wrong Visit.visitDate
// in production regardless of what front desk actually typed.
export function parseISTDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00.000+05:30`);
}

// Same idea as getISTDayBoundsUTC, but for the given instant's IST calendar
// month (e.g. the doctor reporting screen's "This month" figures).
export function getISTMonthBoundsUTC(date: Date = new Date()): { start: Date; end: Date } {
  const parts = getISTDateString(date).split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+05:30`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000+05:30`);
  return { start, end };
}

// Every screen that displays a stored instant (visitDate, createdAt,
// paidAt, ...) was calling the bare `date.toLocaleString()`/
// `toLocaleDateString()` with no timeZone -- those use the *server's own*
// OS timezone, not IST. Local dev's Mac happens to already run in IST,
// which is exactly why this was invisible there; the production Docker
// container runs in UTC (no TZ configured), so every one of these was
// showing times 5.5 hours behind what front desk/doctor/pharmacy actually
// entered (e.g. a 5:00 PM appointment rendering as 11:30 AM) -- the same
// underlying bug already fixed on the write side above
// (getISTNowDateTimeStrings/parseISTDateTime), now fixed on the read/
// display side too.
//
// `en-GB` with explicit 2-digit month/day (a later, explicitly requested
// change from the original `en-US`) renders DD/MM/YYYY -- e.g.
// "05/08/2026" -- instead of en-US's M/D/YYYY (e.g. "8/5/2026", the
// convention that was showing on printed bills and reading as the wrong
// date entirely for anyone expecting the Indian DD/MM/YYYY convention).
// Every caller of formatISTDate/formatISTDateTime across the app (bills,
// front desk, doctor, pharmacy, patient records, reports) goes through
// this one shared pair, so the fix applies everywhere a stored date is
// displayed. Native `<input type="date">` fields (e.g. the front desk
// appointment date field) are unaffected -- their on-screen format is the
// browser's own locale setting, not something app code controls; only the
// underlying YYYY-MM-DD value (unrelated to *display* format) is set by
// this app.
const IST_DATETIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

export function formatISTDateTime(date: Date): string {
  return IST_DATETIME_FORMATTER.format(date);
}

const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatISTDate(date: Date): string {
  return IST_DATE_FORMATTER.format(date);
}
