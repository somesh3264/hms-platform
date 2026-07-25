# HMS Platform

A multi-tenant hospital management system built with Next.js 14 (App Router),
TypeScript, and Prisma/PostgreSQL. Each hospital or clinic is onboarded as a
tenant, and all clinical and operational data is scoped to a `hospitalId`.

## Modules

Application code is organized by domain under `src/`:

| Module          | Responsibility                                  |
| --------------- | ----------------------------------------------- |
| `tenants`       | Hospital/clinic organizations and their config  |
| `users`         | Staff accounts, roles, and authentication       |
| `patients`      | Patient records and demographics                |
| `visits`        | Patient visits and encounters                   |
| `prescriptions` | Prescriptions issued during visits              |
| `inventory`     | Medical inventory and stock management          |
| `billing`       | Invoicing and billing                           |
| `shared`        | Cross-module utilities (e.g. the Prisma client) |

The Next.js App Router entrypoint lives in `src/app`.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router) + TypeScript
- [Prisma](https://www.prisma.io/) with a PostgreSQL datasource
- ESLint (`eslint-config-next`) + Prettier
- PostgreSQL via Docker Compose for local development

## Prerequisites

- Node.js 18.18+ and npm
- Docker and Docker Compose

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and adjust if needed:

   ```bash
   cp .env.example .env
   ```

3. Start PostgreSQL with Docker Compose:

   ```bash
   docker compose up -d
   ```

4. Apply the Prisma schema to your local database:

   ```bash
   npm run prisma:migrate
   ```

5. Seed a demo hospital, front-desk user, and doctor (needed for the front
   desk module, since staff authentication doesn't exist yet):

   ```bash
   npm run prisma:seed
   ```

6. Start the dev server:

   ```bash
   npm run dev
   ```

The app runs at [http://localhost:3000](http://localhost:3000).

- Front desk registration (search/register patients, create visits, view the
  waiting queue): [http://localhost:3000/front-desk](http://localhost:3000/front-desk)
- Doctor consultation (per-doctor queue, patient history, start consultation,
  save notes): [http://localhost:3000/doctor](http://localhost:3000/doctor)

## Useful scripts

| Command                   | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `npm run dev`             | Start the Next.js dev server                      |
| `npm run build`           | Build for production                              |
| `npm run start`           | Run the production build                          |
| `npm run lint`            | Run ESLint                                        |
| `npm run format`          | Format the codebase with Prettier                 |
| `npm run format:check`    | Check formatting without writing changes          |
| `npm run typecheck`       | Run the TypeScript compiler in check mode         |
| `npm run prisma:generate` | Regenerate the Prisma client                      |
| `npm run prisma:migrate`  | Create/apply a local migration                    |
| `npm run prisma:studio`   | Open Prisma Studio                                |
| `npm run prisma:seed`     | Seed a demo hospital, front-desk user, and doctor |

## Database

The Prisma schema is at `prisma/schema.prisma`. It defines `Hospital`, `User`,
`Patient`, `Visit`, `Prescription`, `Medicine`, `Bill`, `BillLineItem`, and
`AuditLog` models, each (other than `Hospital` itself) scoped by `hospitalId`
to enforce data isolation between hospitals.

### Row-Level Security

Tenant isolation is enforced twice: application-layer `hospitalId` filtering,
plus PostgreSQL Row-Level Security policies as a second, database-enforced
line of defence (`prisma/migrations/*_add_row_level_security`). This requires
two separate database roles/connection strings:

- `DATABASE_URL` — elevated/admin role used by Prisma Migrate to run DDL.
- `APP_DATABASE_URL` — restricted, non-superuser role the running app connects
  as, which the RLS policies actually apply to. RLS does not restrict Postgres
  superusers, so the app must not connect using `DATABASE_URL`'s role.

Both are set in `.env.example`. Application code that queries tenant-owned
tables should use `withHospitalContext` from `@/shared`, which sets the
Postgres session variable the RLS policies filter on, rather than the plain
`prisma` client directly.

To stop and remove the local database container:

```bash
docker compose down
```

Add `-v` to also drop the Postgres data volume.
