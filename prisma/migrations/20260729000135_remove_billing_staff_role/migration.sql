-- BILLING_STAFF is folded into PHARMACIST (the pharmacist now bills for the
-- medicines they dispense themselves -- no separate billing hand-off).
-- Reassign any existing BILLING_STAFF users to PHARMACIST *before* the enum
-- value is dropped below, or the type-swap's USING cast would fail on rows
-- still holding the removed value.
UPDATE "users" SET "role" = 'PHARMACIST' WHERE "role" = 'BILLING_STAFF';

-- AlterEnum
BEGIN;
CREATE TYPE "user_role_new" AS ENUM ('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'FRONT_DESK', 'DOCTOR', 'PHARMACIST');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_new" USING ("role"::text::"user_role_new");
ALTER TYPE "user_role" RENAME TO "user_role_old";
ALTER TYPE "user_role_new" RENAME TO "user_role";
DROP TYPE "user_role_old";
COMMIT;
