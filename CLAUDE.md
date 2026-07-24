# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant hospital management system. Next.js 14 (App Router) + TypeScript on
the frontend/API layer, Prisma against PostgreSQL for persistence. Every hospital
or clinic is onboarded as a `Tenant`, and all clinical/operational data is scoped
by `tenantId` — data isolation between tenants must be enforced in every query,
not just at the schema level.

**Current state**: this is a freshly scaffolded skeleton (config, module folders,
Prisma schema, no `node_modules` installed yet, no business logic implemented).
There is no Node.js/npm available in some environments this repo has been worked
in — verify `node -v` / `npm -v` before assuming install/build/test commands will run.

## Commands

```bash
npm install              # install dependencies (package-lock.json not yet committed)
cp .env.example .env     # set DATABASE_URL before running anything DB-related
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

- `tenants` — hospital/clinic organizations and their config
- `users` — staff accounts, roles (`UserRole`: ADMIN, DOCTOR, NURSE, PHARMACIST, RECEPTIONIST, BILLING), authentication
- `patients` — patient records and demographics
- `visits` — patient visits/encounters, linked to a provider (`User`)
- `prescriptions` — issued during a visit, linked to a prescriber (`User`)
- `inventory` — medical stock (`InventoryItem`, unique per `[tenantId, sku]`)
- `billing` — invoicing (`Invoice`, amounts stored as `amountCents`)
- `shared` — cross-module utilities; currently just the Prisma client singleton (`src/shared/prisma.ts`)

`src/app` is the Next.js App Router entrypoint (`layout.tsx`, `page.tsx`,
`globals.css`) — kept separate from the domain modules above.

Path alias `@/*` maps to `./src/*` (see `tsconfig.json`).

### Data model (`prisma/schema.prisma`)

Single PostgreSQL datasource via `DATABASE_URL`. Every tenant-scoped model
(`User`, `Patient`, `Visit`, `Prescription`, `InventoryItem`, `Invoice`) carries
a `tenantId` foreign key to `Tenant` plus an `@@index([tenantId])`, and several
carry compound uniqueness scoped by tenant (e.g. `User` is unique on
`[tenantId, email]`, `InventoryItem` on `[tenantId, sku]`). When adding new
models or queries, follow this same pattern: scope by `tenantId` and index it.

Relations of note: `Visit.provider` and `Prescription.prescriber` both point at
`User` but use named relations (`VisitProvider`, `PrescriptionPrescriber`) since
`User` has multiple distinct relations into these models.

The Prisma client is accessed via the singleton in `src/shared/prisma.ts`
(reused across hot reloads in dev to avoid exhausting the Postgres connection
pool) — import `prisma` from `@/shared` rather than instantiating `PrismaClient`
directly.

### Local infra

`docker-compose.yml` runs a single `postgres:16-alpine` service (user/pass/db =
`hms`/`hms`/`hms`, port 5432, named volume `hms_postgres_data`). `.env.example`
has the matching `DATABASE_URL`.
