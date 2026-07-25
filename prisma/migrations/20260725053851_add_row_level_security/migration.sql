-- Row-Level Security (RLS): a database-enforced second line of defence for
-- tenant isolation, beneath application-layer hospitalId filtering, per TRD
-- Section 2.3 / Section 8 ("physically impossible for one hospital's query
-- to read or write another hospital's rows, even if application code has a
-- bug"). Prisma has no declarative RLS support, so this is hand-written SQL.
--
-- Design:
--   * Applies to every tenant-owned table (all tables that carry hospital_id).
--     `hospitals` itself is the root/tenant registry, not tenant-owned, and is
--     intentionally excluded (matches TRD Section 5's data model summary).
--   * Each policy compares hospital_id against the Postgres session variable
--     app.current_hospital_id, set per-request/per-transaction by the app via
--     set_config('app.current_hospital_id', <id>, true) -- see
--     src/shared/tenant-context.ts. `true` scopes it to SET LOCAL semantics,
--     so it resets at transaction end and can't leak across pooled connections.
--   * If the app ever fails to set that session variable (e.g. a bug, or a
--     forgotten code path), current_setting(..., true) returns NULL and every
--     comparison evaluates to NULL/false -- rows are hidden and writes are
--     rejected by default (fail closed), rather than exposing all hospitals.
--   * FORCE ROW LEVEL SECURITY makes the policy apply even to the table owner
--     (the role migrations run as). Note it still does NOT apply to Postgres
--     superusers -- which is why a separate, non-superuser `hms_app` role is
--     provisioned below for the running application to connect as. The `hms`
--     role from DATABASE_URL (superuser locally, per the official postgres
--     Docker image's POSTGRES_USER behaviour) is for running migrations only.

-- Least-privilege role for the running application (as opposed to the
-- migration/admin role). Created idempotently so this migration is safe to
-- run against any environment (local/CI/staging/prod) regardless of whether
-- the role already exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hms_app') THEN
    -- Local-dev-only password, mirroring the existing hms/hms placeholder
    -- credentials in docker-compose.yml. Rotate this in any shared/production
    -- environment immediately after provisioning.
    CREATE ROLE hms_app LOGIN PASSWORD 'hms_app_dev_only';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO hms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hms_app;

-- Ensures tables added by future migrations automatically grant hms_app
-- access, so nobody has to remember to add a GRANT alongside every new table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hms_app;

-- users
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));

-- patients
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patients" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "patients"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));

-- visits
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visits"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));

-- prescriptions
ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "prescriptions"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));

-- medicines
ALTER TABLE "medicines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "medicines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "medicines"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));

-- bills
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bills" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bills"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));

-- bill_line_items
ALTER TABLE "bill_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill_line_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bill_line_items"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));

-- audit_logs
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));
