// Shown next to every payment-method field that offers UPI, so staff can
// have the patient scan-to-pay directly instead of reading out a UPI
// handle. Admin-uploaded (src/app/admin/hospital), not derived from a raw
// UPI ID -- see Hospital.upiQrCodeUrl. Always rendered when configured
// (not toggled based on which payment method is currently selected) --
// this app has no client-side JS to react to a <select>'s live value, so a
// small always-visible, clearly labeled code is the dependency-free
// alternative to a dynamic show/hide.
export function UpiQrCode({ url }: { url: string | null }) {
  if (!url) {
    return null;
  }
  return (
    <div>
      <p>Scan to pay via UPI:</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="UPI QR code" style={{ maxHeight: '160px' }} />
    </div>
  );
}
