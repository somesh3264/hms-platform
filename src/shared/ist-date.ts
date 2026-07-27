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
