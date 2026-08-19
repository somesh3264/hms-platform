'use client';

// window.print() needs real client-side JS -- the one deliberate exception
// to this app's no-client-components convention (see the comment atop
// src/app/billing/[billId]/page.tsx). One button covers both "print" and
// "download": every major browser's print dialog offers "Save as PDF" as a
// destination, so this needs no server-side PDF library. Generalized from
// the original bill-only PrintBillButton once the front desk's prescription
// form (src/app/front-desk/prescription-form/[visitId]) needed the exact
// same button -- nothing about it was actually bill-specific.
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      Print / Download PDF
    </button>
  );
}
