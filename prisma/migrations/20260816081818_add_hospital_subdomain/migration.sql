-- Shared-platform tenant resolution (BRS FR-1.7): requests will be routed by
-- the subdomain of the Host header instead of resolveCurrentHospitalId's
-- "oldest active hospital" shortcut. Existing rows are backfilled with a
-- slug derived from their name (lowercased, non-alphanumeric runs collapsed
-- to a single hyphen), deduped by appending part of the row id on collision,
-- rather than requiring a manual value before the column can go NOT NULL.

ALTER TABLE "hospitals" ADD COLUMN "subdomain" TEXT;

UPDATE "hospitals"
SET "subdomain" = sub.slug
FROM (
  SELECT
    "id",
    CASE
      WHEN row_number() OVER (PARTITION BY base ORDER BY "created_at") = 1 THEN base
      ELSE base || '-' || right("id", 6)
    END AS slug
  FROM (
    SELECT
      "id",
      "created_at",
      trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')) AS base
    FROM "hospitals"
  ) named
) sub
WHERE "hospitals"."id" = sub."id";

ALTER TABLE "hospitals" ALTER COLUMN "subdomain" SET NOT NULL;
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_subdomain_key" UNIQUE ("subdomain");
