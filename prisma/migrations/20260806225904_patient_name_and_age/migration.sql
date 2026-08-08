-- Patient registration collects a single name field and a plain integer
-- age instead of first/last name and date of birth. Existing rows are
-- backfilled (not dropped blind): name from the concatenated first/last
-- name, age computed from the stored date of birth as of today -- so
-- historical patient records stay readable after the column swap instead
-- of losing data.

-- name
ALTER TABLE "patients" ADD COLUMN "name" TEXT;
UPDATE "patients" SET "name" = trim(both ' ' from (COALESCE("first_name", '') || ' ' || COALESCE("last_name", '')));
ALTER TABLE "patients" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "patients" DROP COLUMN "first_name";
ALTER TABLE "patients" DROP COLUMN "last_name";

-- age
ALTER TABLE "patients" ADD COLUMN "age" INTEGER;
UPDATE "patients" SET "age" = GREATEST(0, EXTRACT(YEAR FROM AGE(CURRENT_DATE, "date_of_birth"))::int);
ALTER TABLE "patients" ALTER COLUMN "age" SET NOT NULL;
ALTER TABLE "patients" DROP COLUMN "date_of_birth";
