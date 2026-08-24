// Every screen that shows a visit's assigned doctor name should use this
// instead of reading visit.doctor.name directly, so a visit booked via the
// "Shivgeet hospital" dropdown entry (see HOSPITAL_DOCTOR_SENTINEL,
// User.isPrimaryDoctor) consistently shows that label wherever the doctor's
// name would otherwise appear -- front desk's own queues, the doctor's
// visit detail page and visit history, and the patient longitudinal view.
// Client-specific literal wording, not derived from Hospital.name, matching
// the dropdown option itself (src/app/front-desk/page.tsx's doctorOptions).
export function getVisitDoctorLabel(visit: {
  doctor: { name: string };
  bookedAsHospital: boolean;
}): string {
  return visit.bookedAsHospital ? 'Shivgeet hospital' : visit.doctor.name;
}
