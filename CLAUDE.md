# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant hospital management system. Next.js 14 (App Router) + TypeScript on
the frontend/API layer, Prisma against PostgreSQL for persistence. Every hospital
is onboarded as a `Hospital`, and all clinical/operational data is scoped by
`hospitalId` — data isolation between hospitals must be enforced in every query,
not just at the schema level. The production design also relies on PostgreSQL
Row-Level Security as a second line of defense beneath application-layer checks
(see `docs/HMS_Technical_Requirements_Document.md` Section 2.3/8) — RLS policies
are not yet implemented in this repo.

`docs/HMS_Business_Requirement_Specification.md` (BRS) and
`docs/HMS_Technical_Requirements_Document.md` (TRD) are the source-of-truth
product/architecture docs this codebase implements. TRD Section 5 explicitly
defers field-level schema detail to `prisma/schema.prisma` itself — when in
doubt about a model's fields, that schema is authoritative, not the docs.

**Current state**: early-stage scaffold. App Router skeleton, module folders,
the Prisma schema, and two migrations (initial schema + Row-Level Security)
exist; no business logic implemented yet. Node.js was not preinstalled in this
environment — it was installed via nvm (`~/.nvm`, Node 20) and Docker is not
installed, so neither migration has been run/verified against a live Postgres
yet (the initial one was generated with `prisma migrate diff --from-empty`,
schema-only; the RLS one is hand-written SQL, since Prisma has no declarative
RLS support). Verify `node -v` / `docker ps` before assuming either is
available, and run `prisma migrate deploy` against a real Postgres (e.g. via
`docker compose up -d`) before trusting either migration is valid in practice.

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
```

No test runner is configured yet — there are no test files or test script in
`package.json`. If asked to add tests, a test command/framework needs to be
chosen and wired into `package.json` first.

## Architecture

### Module layout (`src/`)

Code is organized by domain, one top-level folder per module, each currently a
barrel `index.ts` placeholder:

- `tenants` — hospital onboarding/branding/config (maps to the `Hospital` model)
- `users` — staff accounts, roles (`UserRole`: SUPER_ADMIN, HOSPITAL_ADMIN, FRONT_DESK, DOCTOR, PHARMACIST, BILLING_STAFF), authentication
- `patients` — patient records and demographics (`Patient`)
- `visits` — patient visits/encounters, assigned to a doctor (`Visit`)
- `prescriptions` — scanned prescriptions uploaded during a visit (`Prescription`)
- `inventory` — medical stock (`Medicine`; no DB-level uniqueness on name/batch, dedupe is app-level)
- `billing` — invoicing (`Bill` + `BillLineItem`, amounts stored as `*Cents` integers)
- `shared` — cross-module utilities; currently just the Prisma client singleton (`src/shared/prisma.ts`)

`src/app` is the Next.js App Router entrypoint (`layout.tsx`, `page.tsx`,
`globals.css`) — kept separate from the domain modules above.

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
authored — it has not been applied/verified against a real database yet.
Run `prisma migrate deploy` (or `npm run prisma:migrate` once Postgres is up)
before trusting it's schema-valid in practice.

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

### Local infra

`docker-compose.yml` runs a single `postgres:16-alpine` service (user/pass/db =
`hms`/`hms`/`hms`, port 5432, named volume `hms_postgres_data`). `.env.example`
has the matching `DATABASE_URL`.
