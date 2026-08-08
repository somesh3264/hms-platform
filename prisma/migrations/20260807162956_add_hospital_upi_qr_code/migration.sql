-- Hospital Admin-uploaded UPI QR code, shown wherever staff can select UPI
-- as a payment method. Purely additive, nullable (existing hospitals have
-- none until an admin uploads one) -- no data backfill needed.
ALTER TABLE "hospitals" ADD COLUMN "upi_qr_code_url" TEXT;
