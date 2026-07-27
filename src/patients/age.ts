// Pure function, not a stored field -- age is always computed from
// dateOfBirth as of "now" (FR-4.7's per-row age on the doctor home
// screen), same "derived, not stored" approach as
// src/inventory/status.ts's isLowStock/isExpired.
export function calculateAge(dateOfBirth: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();

  const hasHadBirthdayThisYear =
    asOf.getMonth() > dateOfBirth.getMonth() ||
    (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() >= dateOfBirth.getDate());

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age;
}
