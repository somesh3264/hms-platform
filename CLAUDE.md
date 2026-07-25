# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant hospital management system. Next.js 14 (App Router) + TypeScript on
the frontend/API layer, Prisma against PostgreSQL for persistence. Every hospital
is onboarded as a `Hospital`, and all clinical/operational data is scoped by
`hospitalId` — data isolation between hospitals must be enforced in every query,
not just at the schema level. The production design also relies on PostgreSQL
Row-Level Security as a second line of defense beneath application-layer checks
(see `docs/HMS_Technical_Requirements_Document.md` Section 2.3/8) — implemented,
see "Row-Level Security" below.

`docs/HMS_Business_Requirement_Specification.md` (BRS) and
`docs/HMS_Technical_Requirements_Document.md` (TRD) are the source-of-truth
product/architecture docs this codebase implements. TRD Section 5 explicitly
defers field-level schema detail to `prisma/schema.prisma` itself — when in
doubt about a model's fields, that schema is authoritative, not the docs.

**Current state**: early-stage. Schema, RLS, and the first two feature modules
— front desk registration (BRS FR-3.1–FR-3.6) and doctor consultation (BRS
FR-4.1–FR-4.5) — are implemented; other modules are still barrel placeholders.
All migrations have been applied via `prisma migrate deploy`/`prisma migrate
dev` against a real local Postgres and verified end to end (not just
typechecked) — including that `hms_app` (no context set) sees zero rows, sees
only its scoped hospital's rows once `withHospitalContext` sets the session
variable, and gets a real Postgres error on a cross-tenant insert attempt; the
`hms` superuser bypasses RLS entirely, confirming the app must never connect
as it. Both feature modules' flows were verified the same way: driven through
the real Server Actions via the no-JS progressive-enhancement form POST path,
not just unit-level calls (front desk: register → search → create visit →
queue; doctor: open queue → start consultation → save notes, plus a direct
check that `completeConsultation` rejects without a prescription and succeeds
once one exists).

Neither Docker nor a system Postgres install was available in this
environment (no Homebrew either, and no passwordless sudo, so Homebrew itself
couldn't be installed). Verification instead used Postgres.app's binaries
directly, without installing anything system-wide: downloaded the DMG, copied
`Postgres.app` into `~/Applications` (user-writable, no sudo), and ran
`~/Applications/Postgres.app/Contents/Versions/16/bin/{initdb,pg_ctl}` against
a data directory at `~/pg-data-hms` — bypassing the app's GUI entirely. If
that Postgres instance isn't running, restart it with:
`~/Applications/Postgres.app/Contents/Versions/16/bin/pg_ctl -D ~/pg-data-hms -l ~/pg-data-hms/logfile -o "-p 5432 -k /tmp" start`.
This is a one-off local stand-in for `docker compose up -d`
(`docker-compose.yml`/the README's Docker workflow is still what a real
Docker-equipped environment should use) — verify `node -v` / `docker ps` /
`pg_isready -h localhost -p 5432` before assuming any of these are available
in a fresh environment rather than assuming this setup persists.

## Commands

```bash
npm install              # install dependencies (package-lock.json not yet committed)
cp .env.example .env     # sets DATABASE_URL (admin) and APP_DATABASE_URL (RLS-restricted)
docker compose up -d     # start local Postgres (postgres:16-alpine, db "hms")

npm run dev               # Next.js dev server (http://localhost:3000)
npm run build              # production build
npm run start               # run production build
npm run lint                 # ESLint (next/core-web-vitals + prettier)
npm run format                # Prettier --write
npm run format:check           # Prettier --check
npm run typecheck               # tsc --noEmit

npm run prisma:generate          # regenerate Prisma client after schema changes
npm run prisma:migrate            # create/apply a local migration
npm run prisma:studio              # open Prisma Studio
npm run prisma:seed                # seed a demo hospital + front-desk user + doctor (required for /front-desk)
```

No test runner is configured yet — there are no test files or test script in
`package.json`. If asked to add tests, a test command/framework needs to be
chosen and wired into `package.json` first.

## Architecture

### Module layout (`src/`)

Code is organized by domain, one top-level folder per module. Most are still
barrel `index.ts` placeholders; `patients` and `visits` now hold real
data-access functions (see "Front desk registration" and "Doctor
consultation" below):

- `tenants` — hospital onboarding/branding/config (maps to the `Hospital` model) — placeholder
- `users` — staff accounts, roles (`UserRole`: SUPER_ADMIN, HOSPITAL_ADMIN, FRONT_DESK, DOCTOR, PHARMACIST, BILLING_STAFF), authentication — placeholder (no auth exists yet, see below)
- `patients` — `searchPatients`, `registerPatient`, `updatePatientDemographics`, `generatePatientCode`, `getPatientHistory` (`Patient`)
- `visits` — `createVisit`, `listWaitingQueue`, `listVisitsForDoctor`, `getVisitDetail`, `startConsultation`, `saveConsultationNotes`, `completeConsultation` (`Visit`)
- `prescriptions` — scanned prescriptions uploaded during a visit (`Prescription`) — placeholder
- `inventory` — medical stock (`Medicine`; no DB-level uniqueness on name/batch, dedupe is app-level) — placeholder
- `billing` — invoicing (`Bill` + `BillLineItem`, amounts stored as `*Cents` integers) — placeholder
- `shared` — cross-module utilities: Prisma client singleton (`prisma.ts`), `withHospitalContext`
  (`tenant-context.ts`), `recordAuditLog` (`audit-log.ts`), and the temporary
  `getDevFrontDeskSession`/`getDevDoctorSession` stubs (`dev-session.ts`, see below)

Every data-access function in `patients`/`visits` takes a
`Prisma.TransactionClient` (`tx`) as its first argument rather than importing
`prisma` itself — callers open it via `withHospitalContext` so RLS scoping and
the function's logic can't be pulled apart. Follow this pattern for new
modules: no module-level function should import the `prisma` singleton
directly for tenant-owned tables.

`src/app` is the Next.js App Router entrypoint (`layout.tsx`, `page.tsx`,
`globals.css`, plus feature routes like `front-desk/` and `doctor/`) — kept
separate from the domain modules above; routes call into the domain modules
rather than querying Prisma directly.

Path alias `@/*` maps to `./src/*` (see `tsconfig.json`).

### Data model (`prisma/schema.prisma`)

Single PostgreSQL datasource via `DATABASE_URL`. Models: `Hospital` (root
tenant, no `hospitalId` of its own), `User`, `Patient`, `Visit`,
`Prescription`, `Medicine`, `Bill`, `BillLineItem`, `AuditLog`. Every
tenant-owned model carries a `hospitalId` foreign key to `Hospital` plus an
`@@index` on it — including `BillLineItem`, which also has a direct
`hospitalId` (not just reachable via `Bill`) so Row-Level Security policies
can filter on it without a join. When adding new models or queries, follow
this same pattern: scope by `hospitalId` and index it.

All fields/tables use `@map`/`@@map` to snake_case DB column/table names
(e.g. `hospitalId` → `hospital_id`), matching the column naming the TRD uses
when describing the RLS design. Keep new fields consistent with this mapping.

Relations of note:

- `Visit.doctor` and `Prescription.uploadedBy` both point at `User` via named
  relations (`VisitDoctor`, `PrescriptionUploadedBy`) since `User` has
  multiple distinct relations into these models. `AuditLog.actor` similarly
  uses `AuditLogActor`.
- `BillLineItem` optionally references `Medicine` (nullable — service charges
  like consultation fees have no medicine) and optionally references the
  `Prescription` it fulfils.
- Money fields are integer cents (`unitPriceCents`, `totalCents`, etc.), not
  floats — preserve this convention for any new monetary field.

Compound uniqueness scoped by hospital: `User` on `[hospitalId, email]`,
`Patient` on `[hospitalId, patientCode]`, `Bill` on `[hospitalId, billNumber]`.

The initial migration (`prisma/migrations/*_init/`) was generated via
`prisma migrate diff --from-empty --to-schema-datamodel` rather than
`prisma migrate dev`, because no live Postgres was reachable when it was
authored. It has since been applied via `prisma migrate deploy` and confirmed
schema-valid (see "Current state" above).

### Row-Level Security (`prisma/migrations/*_add_row_level_security`)

Hand-written SQL (not schema-diffed — Prisma has no declarative RLS support)
enabling and forcing RLS on every tenant-owned table, with a single `FOR ALL`
policy per table comparing `hospital_id` to the Postgres session variable
`app.current_hospital_id`. If that session variable is ever unset (e.g. a
code path forgets to set it), the comparison evaluates to NULL and the policy
fails closed — no rows visible or writable — rather than exposing everything.

This requires two distinct database roles, both set in `.env.example`:

- `DATABASE_URL` — elevated/admin role Prisma Migrate runs DDL as (superuser
  locally, matching the official postgres Docker image's `POSTGRES_USER`
  behavior).
- `APP_DATABASE_URL` — the restricted `hms_app` role (provisioned by the RLS
  migration itself) the _running app_ connects as. This split exists because
  RLS does not apply to Postgres superusers or (without `FORCE ROW LEVEL
SECURITY`) table owners — connecting the app with the admin role would make
  the policies silently inert.

`src/shared/prisma.ts` points the app's `PrismaClient` at `APP_DATABASE_URL`
(falling back to `DATABASE_URL` if unset, purely so `npm run dev` doesn't
break before it's configured — that fallback silently bypasses RLS, so don't
rely on it past initial setup).

Any query against a tenant-owned table must go through
`withHospitalContext(hospitalId, fn)` (`src/shared/tenant-context.ts`, exported
from `@/shared`), which opens a transaction and sets
`app.current_hospital_id` via `set_config(..., true)` (parameterized, not
string-interpolated) before running `fn`. Using the plain `prisma` client
directly for tenant-owned tables will hit the fail-closed RLS default and
return/write nothing.

The Prisma client is accessed via the singleton in `src/shared/prisma.ts`
(reused across hot reloads in dev to avoid exhausting the Postgres connection
pool) — import `prisma` from `@/shared` rather than instantiating `PrismaClient`
directly.

### Front desk registration (`src/app/front-desk`, `src/patients`, `src/visits`)

Implements BRS FR-3.1–FR-3.6: search patients (`searchPatients`), register a
new one with an auto-generated per-hospital ID (`registerPatient` +
`generatePatientCode`), update demographics (`updatePatientDemographics`),
create a visit assigned to a doctor (`createVisit`), and view the waiting
queue (`listWaitingQueue`). `page.tsx` is a Server Component; `actions.ts`
holds the `'use server'` Server Actions it wires to plain HTML forms (no
client components, no client-side JS needed).

`generatePatientCode` (`src/patients/patient-code.ts`) increments
`Hospital.patientCodeSeq` via an atomic `UPDATE ... RETURNING`, not a
read-then-write, so concurrent registrations at the same hospital can't
collide. Every write in this module also calls `recordAuditLog` in the same
transaction (FR-2.5).

**No authentication exists yet (FR-2.4 is unimplemented).**
`src/shared/dev-session.ts`'s `getDevFrontDeskSession()` is a deliberate,
clearly-marked stand-in: it resolves "the current hospital/actor" by querying
the first `Hospital` and its first `FRONT_DESK` user, seeded by
`prisma/seed.mjs` (`npm run prisma:seed`) — run that once before exercising
this route, or `getDevFrontDeskSession` throws. Every call site using it must
be revisited once real auth lands; don't extend this pattern to new routes
without flagging it the same way.

### Doctor consultation (`src/app/doctor`, `src/visits`, `src/patients`)

Implements BRS FR-4.1–FR-4.5: the doctor's queue for the day
(`listVisitsForDoctor`, waiting + in-consultation so a doctor can resume one
they left mid-visit), the visit detail screen aggregating patient
demographics and full visit/prescription history (`getVisitDetail` +
`getPatientHistory`), starting a consultation (`startConsultation`: WAITING →
IN_CONSULTATION only), and saving free-text consultation notes
(`saveConsultationNotes`, only while IN_CONSULTATION). Uses
`getDevDoctorSession()` (same `dev-session.ts` stub, same caveats as above).

**`completeConsultation` is implemented but intentionally not wired to any
UI.** FR-4.5 requires a consultation only be completable once a prescription
has been uploaded against the visit, so the function checks for a
`Prescription` row (`hospitalId` + `visitId`) before allowing
IN_CONSULTATION → COMPLETED. Prescription upload (BRS Module 3.5) doesn't
exist yet, so any "Complete consultation" button right now could never
succeed — the visit detail page shows explanatory text instead. This was
verified directly against the database (rejects with zero prescriptions,
succeeds once one is inserted) rather than left untested just because it has
no UI path yet. Wire it up (and remove the explanatory text) once
prescription upload is built — don't add a bypass/override to make it usable
sooner.

### Local infra

`docker-compose.yml` runs a single `postgres:16-alpine` service (user/pass/db =
`hms`/`hms`/`hms`, port 5432, named volume `hms_postgres_data`). `.env.example`
has the matching `DATABASE_URL`.
