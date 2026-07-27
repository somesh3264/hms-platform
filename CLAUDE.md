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

**Current state**: early-stage. Schema, RLS, the first five feature
modules — front desk registration (BRS FR-3.1–FR-3.6), doctor consultation
(BRS FR-4.1–FR-4.5), prescription digitization & routing (BRS FR-5.1–FR-5.6),
the in-house medical store / pharmacy (BRS FR-6.1–FR-6.10), and digital
billing (BRS FR-7.1–FR-7.7) — plus real authentication (BRS FR-2.4, see
"Authentication" below), the patient longitudinal view (BRS FR-8.1–FR-8.3),
and a minimal hospital branding admin screen (BRS FR-1.2/FR-1.3) are
implemented. Explicitly not yet built: Super Admin hospital onboarding/
subscription management (FR-1.1/FR-1.6), Hospital Admin user CRUD (FR-2.2),
reporting/dashboards (FR-9), and notifications/digital delivery (FR-10).
All migrations have been applied via `prisma migrate
deploy`/`prisma migrate dev` against a real local Postgres and verified end
to end (not just typechecked) — including that `hms_app` (no context set)
sees zero rows, sees only its scoped hospital's rows once
`withHospitalContext` sets the session variable, and gets a real Postgres
error on a cross-tenant insert attempt; the `hms` superuser bypasses RLS
entirely, confirming the app must never connect as it. Each feature module's
flow was verified the same way: driven through the real Server Actions via
the no-JS progressive-enhancement form POST path (including a real multipart
file upload for prescriptions, round-tripped through `/api/uploads` and
diffed byte-for-byte against the source file; a stock oversell attempt
confirmed to leave stock untouched; and a full register→visit→prescription→
dispense→bill→pay chain with the GST/discount math checked by hand against
what was stored), not just unit-level calls. Authentication, the patient
longitudinal view, and the hospital branding admin screen were verified the
same way against a real browser session: logging in as all 5 seeded roles
and confirming each lands on its own module with only its own nav links
visible; a wrong password showing the inline error without revealing which
field was wrong; a role hitting another role's URL directly bouncing back
through `/`; logout clearing the session so a protected URL redirects back
to `/login`; the patient record view showing a real dispense→bill→pay
chain's prescription scan and paid bill with working links; and a hospital
logo upload round-tripped byte-for-byte through `saveHospitalLogo`/
`/api/uploads` the same way prescription uploads were, then confirmed to
appear on both the nav header and the printable bill view.

**Operational notes**:

- If a schema change stops taking effect at runtime (Prisma errors mentioning
  fields/relations that look wrong, or that contradict what `npx prisma
studio`/`psql` shows), the long-running `next dev` process is almost
  certainly holding a stale `@prisma/client` — Next doesn't watch
  `node_modules` for changes, so `prisma generate`/`migrate dev` regenerating
  the client mid-session doesn't hot-reload it. Kill and restart `npm run dev`
  after any schema change; don't debug it as an application bug first.
- `BillLineItem.billId` has `ON DELETE SET NULL` (see "Digital billing"
  below). Deleting a test `Bill` row directly (e.g. via `psql`, cleaning up
  after manual testing) does **not** delete its line items — it orphans them
  back to `billId IS NULL`, which then reappears in `listVisitsReadyToBill`.
  Delete `bill_line_items` explicitly first, or you'll find stale "ready to
  bill" entries later.

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
npm run prisma:seed                # seed a demo hospital (with address/GSTIN) + hospital-admin/front-desk/doctor/pharmacist/billing-staff users (all password "password123") + demo medicines
```

No test runner is configured yet — there are no test files or test script in
`package.json`. If asked to add tests, a test command/framework needs to be
chosen and wired into `package.json` first.

## Architecture

### Module layout (`src/`)

Code is organized by domain, one top-level folder per module. `tenants` and
`users` each hold one real function so far (see below); `patients`, `visits`,
`prescriptions`, `inventory`, and `billing` hold the fuller set of
data-access functions (see the module sections below):

- `tenants` — `updateHospitalBranding` (hospital branding/config, maps to the `Hospital` model); Super Admin onboarding/subscription management (FR-1.1/FR-1.6) is not yet built
- `users` — `authenticateUser` (FR-2.4 login); staff accounts, roles (`UserRole`: SUPER_ADMIN, HOSPITAL_ADMIN, FRONT_DESK, DOCTOR, PHARMACIST, BILLING_STAFF); Hospital Admin user CRUD (FR-2.2) is not yet built
- `patients` — `searchPatients`, `registerPatient`, `updatePatientDemographics`, `generatePatientCode`, `getPatientHistory` (`Patient`)
- `visits` — `createVisit`, `listWaitingQueue`, `listVisitsForDoctor`, `getVisitDetail`, `startConsultation`, `saveConsultationNotes`, `completeConsultation` (`Visit`)
- `prescriptions` — `uploadPrescription`, `replacePrescription`, `listPharmacyQueue`, `getPrescriptionDetail` (`Prescription`)
- `inventory` — `searchMedicines`, `listMedicines`, `listLowStockMedicines`, `dispenseItem`, `finalizeDispensing` (`Medicine`; no DB-level uniqueness on name/batch, dedupe is app-level)
- `billing` — `listVisitsReadyToBill`, `createBill`, `recordPayment`, `searchBills`, `getBillDetail`, `generateBillNumber` (`Bill` + `BillLineItem`, amounts stored as `*Cents` integers)
- `shared` — cross-module utilities: Prisma client singleton (`prisma.ts`), `withHospitalContext`
  (`tenant-context.ts`), `recordAuditLog` (`audit-log.ts`), the local-disk file storage stand-in
  (`storage.ts`, see "Prescription digitization" below), and the signed-cookie session
  (`session.ts`: `createSession`/`getSession`/`requireSession`/`destroySession`/`ROLE_HOME`,
  see "Authentication" below)

Every data-access function in
`patients`/`visits`/`prescriptions`/`inventory`/`billing` takes a
`Prisma.TransactionClient` (`tx`) as its first argument rather than importing
`prisma` itself — callers open it via `withHospitalContext` so RLS scoping and
the function's logic can't be pulled apart. Follow this pattern for new
modules: no module-level function should import the `prisma` singleton
directly for tenant-owned tables.

`src/app` is the Next.js App Router entrypoint (`layout.tsx`, `page.tsx`,
`globals.css`, plus feature routes like `front-desk/`, `doctor/`, `pharmacy/`,
and the `api/uploads/` file-serving route) — kept separate from the domain
modules above; routes call into the domain modules rather than querying
Prisma directly.

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
  `Prescription` it fulfils. `billId` is also nullable (`ON DELETE SET NULL`):
  dispensing (FR-6.5, see "In-house medical store / pharmacy" below) creates
  line items the moment medicines are issued, before a Bill exists; billing
  (`createBill`, see "Digital billing" below) attaches unbilled items
  (`billId IS NULL`) to a real `Bill` once generated.
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

### Authentication (`src/app/login`, `src/app/logout`, `src/shared/session.ts`, `src/users`)

Implements BRS FR-2.4. A signed-cookie session (TRD Section 3: "self-hosted
session/JWT-based auth ... and role middleware"), not a hosted IdP or
next-auth: `src/shared/session.ts` HMAC-signs `{sub, hospitalId, role, name,
exp}` with `SESSION_SECRET` (`.env`/`.env.example`) using Node's
`crypto.createHmac`, stores it in an `httpOnly` cookie, and verifies it on
each request with no server-side session store or DB round-trip -- the
signed cookie is the source of truth between logins, same tradeoff a
stateless JWT would make. Session TTL is 12 hours (TRD 5.1's "session
expiry" NFR); login rate limiting/lockout, also called out in TRD 5.1, is
not implemented.

`/login` is just email/password, no hospital picker: the product is deployed
per hospital (personalization is swapping that hospital's logo/branding, not
one shared login across many hospitals), and there's only one client today,
so `resolveCurrentHospitalId` (`src/tenants/resolve-hospital.ts`) resolves
the tenant automatically -- a direct `prisma.hospital.findFirst` (not through
`withHospitalContext`, since `hospitals` carries no RLS policy; see
"Row-Level Security" above), oldest `ACTIVE` hospital first. **This silently
picks an arbitrary hospital once a second one is onboarded** -- it's
explicitly flagged in that file as needing a real tenant-resolution
mechanism (e.g. per-hospital subdomain) before that happens; don't build
more on top of the current shortcut without revisiting it first.
`authenticateUser` (`src/users/authenticate.ts`) looks up the `User` row
scoped by `[hospitalId, email]` inside `withHospitalContext` (the `users`
table *is* RLS-protected), compares the password with `bcryptjs`, and records a
`LOGIN` audit entry on success; it returns `null` on any failure (unknown
email, wrong password, inactive user) without distinguishing which, and
`src/app/login/actions.ts` redirects back to `/login?error=1` rather than
throwing -- a deliberate, narrow deviation from the throw-on-invalid-input
convention used elsewhere (see below), since login failures are
expected/frequent, not a client error to surface via Next's default error
page.

`requireSession(allowedRoles?)` is the replacement for the old
`getDevFrontDeskSession`/`getDevDoctorSession`/`getDevPharmacistSession`/
`getDevBillingSession` dev-only stubs (deleted): it redirects to `/login` if
there's no session, to `/` (which redirects by role via `ROLE_HOME`) if the
role isn't allowed, and otherwise returns `{hospitalId, actorId, role,
name}` -- the same shape the dev-session stubs returned, so every
page/action in front-desk/doctor/pharmacy/billing calls it exactly like they
called the stub it replaced, just with an explicit allowed-roles list.
`src/app/layout.tsx` calls `getSession()` (not `requireSession`, since
`/login` itself must render without one) to conditionally show the shared
nav header (hospital branding, current user, role-appropriate links, log
out).

**Not yet built**: Hospital Admin creating/editing/deactivating other users
(FR-2.2) -- only the 5 users `prisma/seed.mjs` creates can log in today;
Super Admin tenant onboarding (FR-1.1/FR-1.6); fine-grained per-screen
permissions beyond the role-gated routes above (FR-2.3 is satisfied at the
route level only).

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

Gated to the `FRONT_DESK` role via `requireSession(['FRONT_DESK'])` (see
"Authentication" above) -- run `npm run prisma:seed` once first so a
`FRONT_DESK` user exists to log in as.

### Doctor consultation (`src/app/doctor`, `src/visits`, `src/patients`)

Implements BRS FR-4.1–FR-4.5: the doctor's queue for the day
(`listVisitsForDoctor`, waiting + in-consultation so a doctor can resume one
they left mid-visit), the visit detail screen aggregating patient
demographics and full visit/prescription history (`getVisitDetail` +
`getPatientHistory`), starting a consultation (`startConsultation`: WAITING →
IN_CONSULTATION only), and saving free-text consultation notes
(`saveConsultationNotes`, only while IN_CONSULTATION). Gated to the
`DOCTOR` role via `requireSession(['DOCTOR'])` (see "Authentication" above).

`completeConsultation` (FR-4.5) requires a `Prescription` row to already
exist for the visit before allowing IN_CONSULTATION → COMPLETED. It's now
wired into the visit detail page's "Complete consultation" button, shown once
prescription upload (below) has produced at least one UPLOADED prescription
for the visit; before that, the page shows explanatory text instead of a
dead button. (This function predates prescription upload existing — it was
originally built and verified directly against the database, with no UI path
to reach it, then wired up once upload landed. If you ever add a function
whose precondition can't yet be satisfied by any UI path, follow the same
pattern: implement and verify it for real, don't fake the UI around it.)

### Prescription digitization & routing (`src/app/doctor` upload/replace forms, `src/app/pharmacy`, `src/prescriptions`)

Implements BRS FR-5.1–FR-5.6. `uploadPrescription` validates MIME type and
size (`src/prescriptions/constants.ts`: images + PDF, 10 MB default, not
load-bearing elsewhere), requires the visit to be IN_CONSULTATION, saves the
file, and creates a `Prescription` row (status `UPLOADED`). "Automatic
routing" (FR-5.4) isn't a separate step or message broker — `listPharmacyQueue`
simply reads `status = 'UPLOADED'`, so a prescription is visible to pharmacy
the instant it's created, in the same transaction. `replacePrescription`
(FR-5.6, re-upload on doctor error) marks the old row `SUPERSEDED` and creates
a new `UPLOADED` one rather than overwriting/deleting — the original stays on
the patient's permanent record (FR-5.5) and `recordAuditLog` captures the
change, only valid while the existing row is still `UPLOADED` (not already
`DISPENSED` or `SUPERSEDED`).

`/pharmacy` (gated to `PHARMACIST` via `requireSession`) lists what's
routed here (proving FR-5.4) and now also links to the dispensing screen for
each — see "In-house medical store / pharmacy" below.

**File storage is a local-disk stand-in for the TRD's real object storage**
(S3-compatible, e.g. Cloudflare R2 — TRD Section 3). `src/shared/storage.ts`
writes under `.data/uploads/` (gitignored) and returns a `/api/uploads/...`
URL; `src/app/api/uploads/[...key]/route.ts` serves it back. **That route has
no access control** — anyone who knows/guesses a storage key can read the
file, regardless of login state. That's acceptable only because it's local
dev; real object storage must use short-lived signed URLs or bucket-scoped
policies, and this route should be deleted (not hardened) once that's wired
up.

### In-house medical store / pharmacy (`src/app/pharmacy`, `src/inventory`)

Implements BRS FR-6.1–FR-6.10. `/pharmacy/[prescriptionId]` (FR-6.2: scan
shown alongside patient/visit details) lets pharmacy staff search inventory
(`searchMedicines`, FR-6.3) and dispense repeatedly, one medicine at a time
(`dispenseItem`) — a prescription is an unstructured scanned image (BRS
Section 2.6), so there's no structured "what was prescribed" list to dispense
against automatically; staff read the scan and select matching medicines
manually, same as in practice. `finalizeDispensing` closes out the
prescription (status → `DISPENSED`, FR-6.10) once at least one item has been
dispensed, mirroring `completeConsultation`'s gate one level down; both the
UI (disabled button) and the function itself enforce this.

`dispenseItem` decrements stock via an atomic conditional `UPDATE ...
WHERE stock_quantity >= quantity RETURNING ...` (FR-6.5) in the same
transaction as creating the `BillLineItem` — not a read-then-write, so
concurrent dispensing can't oversell, and an insufficient-stock attempt
leaves stock completely untouched rather than partially decrementing (verified
directly). Price is snapshotted onto the line item at dispense time
(`unitPriceCents`), so a later catalog price change can't retroactively alter
what was already dispensed.

Low-stock (`isLowStock`, FR-6.6/6.7) and near-expiry (`getExpiryStatus`,
FR-6.9) are pure functions in `src/inventory/status.ts`, not stored flags —
computed from `Medicine.stockQuantity`/`reorderLevel` and the hospital's (or
medicine's override) `lowStockThresholdPercent`. FR-6.8 requires low-stock
visibility to both pharmacy staff (`/pharmacy` and `/pharmacy/inventory`) and
doctors "when prescribing" — `/doctor`'s queue page shows the same
`listLowStockMedicines` list as a banner; keep both in sync if this logic
changes.

### Digital billing (`src/app/billing`, `src/billing`)

Implements BRS FR-7.1–FR-7.7. `/billing` lists visits with dispensed-but-
unbilled line items (`listVisitsReadyToBill`, reachable via
`Visit -> Prescription -> BillLineItem` since line items link to a visit only
through the prescription they fulfil) alongside a history search
(`searchBills`, FR-7.7: by patient name/ID or bill number, optionally a date).
`/billing/new/[visitId]` previews those unbilled items and lets billing staff
add one optional service charge (e.g. consultation fee, FR-7.3) plus a
discount and tax rate; `createBill` (FR-7.1/7.2) does the actual attach: the
existing unbilled `BillLineItem`s get `billId` set to the new `Bill`, the
service charge (if any) is created directly against it, and the bill number
comes from `generateBillNumber` -- same atomic
`UPDATE Hospital.billNumberSeq ... RETURNING` pattern as
`generatePatientCode`.

**Tax (FR-7.4) is computed on the post-discount taxable amount**
(`(subtotal - discount) * taxPercent`), a common but not universal GST
convention -- `taxPercent` is a per-bill input (`DEFAULT_TAX_PERCENT = 5` is
only the form's starting value), not a hardcoded rate, since real GST slabs
vary by item category and aren't modelled here. `createBill` rejects a visit
with nothing to bill (no unbilled items and no service charge) rather than
creating an empty invoice.

`/billing/[billId]` is the printable view (FR-7.6: hospital name/logo/GSTIN,
line items, subtotal/discount/tax/total) and, while `paymentStatus` is
`PENDING`, the payment form (`recordPayment`, FR-7.5: UPI or Cash only, no
insurance/TPA workflow -- this only records that payment happened via the
hospital's own UPI QR/handle, it doesn't process payment). `recordPayment`
rejects a bill that's already `PAID` (verified directly, not just via the
form disappearing from the UI). Printing uses the browser's native print
(a `<style>{'@media print {...}'}</style>` block hides the payment form/nav),
not a PDF library -- the TRD calls for server-side PDF generation, which
isn't built; this is a dependency-free stand-in worth reconsidering if a
real branded PDF becomes a hard requirement.

### Patient longitudinal view (`src/app/patients`, `src/patients/history.ts`)

Implements BRS FR-8.1–FR-8.3: `/patients` searches (reusing `searchPatients`,
same as front desk's search) and `/patients/[patientId]` shows every visit
with its doctor/status/notes, prescriptions (status + a direct link to the
scan), and bills (amount, payment status, a link to `/billing/[billId]`).
Open to any authenticated role via `requireSession()` with no roles argument
(FR-8's "authorized staff", not gated to one module). `getPatientHistory`
(already used by the doctor's visit detail page) was extended to also
`include` each visit's `bills` and the prescription `fileUrl`/`fileType` --
the `Visit.bills` relation already existed, it just wasn't selected before.

### Hospital branding admin (`src/app/admin/hospital`, `src/tenants`)

Implements BRS FR-1.2/FR-1.3 minimally: a `HOSPITAL_ADMIN`-gated form to edit
the `Hospital` branding fields that already existed on the schema but were
seed-only (`name`, `address`, `contactPhone`, `contactEmail`, `gstin`,
`themeColor`, plus a logo upload via `saveHospitalLogo` in
`src/shared/storage.ts` -- a separate small function from `saveFile` rather
than generalizing it, since `saveFile`'s storage key is visit-scoped and a
logo has no visit to hang off of). `updateHospitalBranding`
(`src/tenants/update-branding.ts`) writes both the `Hospital` row and an
audit log entry through the same `withHospitalContext` transaction, even
though `hospitals` itself has no RLS policy -- only the audit log write
needs the tenant-scoped transaction, and running the Hospital update on the
same `tx` is no different from running it on the plain client. `themeColor`
becomes editable here but nothing in the UI consumes it yet (FR-1.4, a
"Should have," is out of scope for now). Super Admin hospital onboarding/
subscription management (FR-1.1/FR-1.6) is not built -- only the one hospital
`prisma/seed.mjs` creates exists.

**The form has full-overwrite semantics, not a partial patch**: every
optional field (`address`, `contactPhone`, `contactEmail`, `gstin`,
`themeColor`) is set to `null` if submitted blank, since the whole form is
always resubmitted together -- there's no per-field "leave unchanged" path.
Confirmed directly: a script that called `updateHospitalBranding` with only
`address` set (omitting the other optional fields, unlike the real form)
wiped the hospital's `gstin` as a side effect -- the function behaving
exactly as designed, not a bug, but a sharp edge worth knowing before
scripting against it outside the real form.

### Local infra

`docker-compose.yml` runs a single `postgres:16-alpine` service (user/pass/db =
`hms`/`hms`/`hms`, port 5432, named volume `hms_postgres_data`). `.env.example`
has the matching `DATABASE_URL`.
