# HMS Platform

A multi-tenant hospital management system built with Next.js 14 (App Router),
TypeScript, and Prisma/PostgreSQL. Each hospital or clinic is onboarded as a
tenant, and all clinical and operational data is scoped to a `hospitalId`.

## Modules

Application code is organized by domain under `src/`:

| Module          | Responsibility                                   |
| --------------- | ------------------------------------------------- |
| `tenants`       | Hospital/clinic organizations and their config    |
| `users`         | Staff accounts, roles, and authentication          |
| `patients`      | Patient records and demographics                   |
| `visits`        | Patient visits and encounters                      |
| `prescriptions` | Prescriptions issued during visits                 |
| `inventory`     | Medical inventory and stock management              |
| `billing`       | Invoicing and billing                               |
| `shared`        | Cross-module utilities (e.g. the Prisma client)     |

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

5. Start the dev server:

   ```bash
   npm run dev
   ```

The app runs at [http://localhost:3000](http://localhost:3000).

## Useful scripts

| Command                  | Description                              |
| ------------------------- | ----------------------------------------- |
| `npm run dev`              | Start the Next.js dev server              |
| `npm run build`            | Build for production                      |
| `npm run start`            | Run the production build                  |
| `npm run lint`             | Run ESLint                                |
| `npm run format`           | Format the codebase with Prettier         |
| `npm run format:check`     | Check formatting without writing changes  |
| `npm run typecheck`        | Run the TypeScript compiler in check mode |
| `npm run prisma:generate`  | Regenerate the Prisma client              |
| `npm run prisma:migrate`   | Create/apply a local migration            |
| `npm run prisma:studio`    | Open Prisma Studio                        |

## Database

The Prisma schema is at `prisma/schema.prisma`. It defines `Hospital`, `User`,
`Patient`, `Visit`, `Prescription`, `Medicine`, `Bill`, `BillLineItem`, and
`AuditLog` models, each (other than `Hospital` itself) scoped by `hospitalId`
to enforce data isolation between hospitals.

To stop and remove the local database container:

```bash
docker compose down
```

Add `-v` to also drop the Postgres data volume.
