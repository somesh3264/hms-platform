-- Row-Level Security for daily_token_counters (FR-3.7/FR-3.8), added after
-- the original RLS migration (prisma/migrations/*_add_row_level_security).
-- Same tenant_isolation policy shape as every other tenant-owned table --
-- see that migration's header comment for the full design rationale.
ALTER TABLE "daily_token_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_token_counters" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "daily_token_counters"
  USING (hospital_id = current_setting('app.current_hospital_id', true))
  WITH CHECK (hospital_id = current_setting('app.current_hospital_id', true));
