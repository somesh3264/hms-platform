# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant hospital management system. Next.js 14 (App Router) + TypeScript on
the frontend/API layer, Prisma against PostgreSQL for persistence. Every hospital
is onboarded as a `Hospital`, and all clinical/operational data is scoped by
`hospitalId` — data isolation between hospitals must be enforced in every query,
not just at the schema level. The production design also relies on PostgreSQL
Row-Level Security as a second line of defense beneath application-layer checks
(see `docs/HMS_Technical_Requirements_Document.md` Section 2.3/9) — implemented,
see "Row-Level Security" below.

`docs/HMS_Business_Requirement_Specification.md` (BRS) and
`docs/HMS_Technical_Requirements_Document.md` (TRD) are the source-of-truth
product/architecture docs this codebase implements. TRD Section 5 explicitly
defers field-level schema detail to `prisma/schema.prisma` itself — when in
doubt about a model's fields, that schema is authoritative, not the docs.

**Current state**: early-stage. Schema, RLS, the first five feature
modules — front desk registration (BRS FR-3.1–FR-3.8, including appointment
scheduling and the daily front-desk token/queue number), doctor consultation
including the FR-4.6–FR-4.12 home screen (BRS FR-4.1–FR-4.12), prescription
digitization & routing (BRS FR-5.1–FR-5.6), the in-house medical store /
pharmacy (BRS FR-6.1–FR-6.10), and digital billing (BRS FR-7.1–FR-7.7) —
plus real authentication (BRS FR-2.4, see "Authentication" below), the
patient longitudinal view (BRS FR-8.1–FR-8.3), a minimal hospital branding
admin screen (BRS FR-1.2/FR-1.3), and Hospital Admin user management (BRS
FR-2.2) are implemented. Explicitly not yet built: subdomain-based hospital
login resolution (BRS FR-1.7, added in BRS v0.4/TRD v0.3 -- login still uses
the single-tenant `resolveCurrentHospitalId` shortcut described in
"Authentication" below); Super Admin hospital onboarding/subscription
management (FR-1.1/FR-1.6) -- of questionable relevance now that the
product is deployed one hospital at a time rather than as a shared
multi-hospital instance, see "Authentication" below -- reporting/dashboards
(FR-9), and notifications/digital delivery (FR-10).
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
appear on both the nav header and the printable bill view. The daily
token/queue number's RLS policy was verified directly with `psql` (not
assumed from the existing pattern): `hms_app` with no tenant context sees
zero rows and can't insert against `daily_token_counters`, and a mismatched
`hospital_id` in the raw `INSERT ... ON CONFLICT` is rejected; token
generation was then verified in the browser across both visit-creation
paths (combined register+visit, and "Create visit" for an existing
patient), confirming sequential numbering (1, 2, 3) regardless of which
path created the visit, and that queue ordering stays based on `visitDate`
(appointment time) even when it diverges from token/creation order.

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
npm run prisma:seed                # seed a demo hospital (with address/GSTIN) + hospital-admin/front-desk/doctor/pharmacist users (all password "password123") + demo medicines
```

No test runner is configured yet — there are no test files or test script in
`package.json`. If asked to add tests, a test command/framework needs to be
chosen and wired into `package.json` first.

## Architecture

### Module layout (`src/`)

Code is organized by domain, one top-level folder per module. `patients`,
`visits`, `prescriptions`, `inventory`, and `billing` hold the fuller set of
data-access functions (see the module sections below):

- `tenants` — `updateHospitalBranding`, `resolveCurrentHospitalId` (hospital branding/config, maps to the `Hospital` model); Super Admin onboarding/subscription management (FR-1.1/FR-1.6) is not built and of questionable relevance under the current single-hospital-per-deployment model
- `users` — `authenticateUser` (FR-2.4 login), `listUsers`/`createUser`/`updateUser`/`resetUserPassword` (FR-2.2); roles (`UserRole`: SUPER_ADMIN, HOSPITAL_ADMIN, FRONT_DESK, DOCTOR, PHARMACIST -- no separate BILLING_STAFF, see "Pharmacist billing" below)
- `patients` — `searchPatients`, `registerPatient`, `updatePatientDemographics`, `generatePatientCode`, `getPatientHistory` (`Patient`)
- `visits` — `createVisit`, `listWaitingQueue`, `listVisitsForDoctor`, `getVisitDetail`, `startConsultation`, `saveConsultationNotes`, `completeConsultation` (`Visit`)
- `prescriptions` — `uploadPrescription`, `replacePrescription`, `listPharmacyQueue`, `getPrescriptionDetail` (`Prescription`)
- `inventory` — `searchMedicines`, `listMedicines`, `listLowStockMedicines`, `dispenseItem`, `finalizeDispensing`, `addMedicineStock` (`Medicine`; no DB-level uniqueness on name/batch, dedupe is app-level)
- `billing` — `listVisitsReadyToBill`, `createBill`, `collectFrontDeskCharges` + `collectConsultationFee` (front desk's own standalone `Bill`s, see "Front desk registration" below), `recordPayment`, `searchBills`, `getBillDetail`, `generateBillNumber` (`Bill` + `BillLineItem`, amounts stored as `*Cents` integers)
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
more on top of the current shortcut without revisiting it first. The login
page itself shows that same resolved hospital's name/logo (`resolveCurrentHospital`,
the full-row sibling of `resolveCurrentHospitalId`) instead of a generic
product name, so staff see which hospital they're signing into -- consistent
with the rest of the app never showing "HMS Platform" once branding is
available.
`authenticateUser` (`src/users/authenticate.ts`) looks up the `User` row
scoped by `[hospitalId, email]` inside `withHospitalContext` (the `users`
table _is_ RLS-protected), compares the password with `bcryptjs`, and records a
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

**Not yet built**: Super Admin tenant onboarding (FR-1.1/FR-1.6) -- moot
under the current single-hospital-per-deployment model (see
`resolveCurrentHospitalId` above) unless that model changes; fine-grained
per-screen permissions beyond the role-gated routes above (FR-2.3 is
satisfied at the route level only).

### Hospital Admin user management (`src/app/admin/users`, `src/users`)

Implements BRS FR-2.2: a `HOSPITAL_ADMIN`-gated screen to create, edit, and
deactivate staff accounts within their own hospital. `/admin/users` lists
every user (`listUsers`) and has a creation form (`createUser`, FR-2.1's six
roles minus `SUPER_ADMIN` -- a platform-level role a Hospital Admin
shouldn't be able to grant, see `ASSIGNABLE_ROLES`); `/admin/users/[userId]`
edits name/email/role/department/active-status (`updateUser`) and resets a
password (`resetUserPassword`) -- there's no self-service "forgot password"
flow, so this is the only recovery path for a locked-out account. Both
`createUser` and `updateUser` pre-check for a duplicate `[hospitalId,
email]` before writing, rather than relying on the DB's unique constraint
to reject it, so the failure is a clear thrown message instead of a raw
Prisma error. `updateUser` also rejects deactivating your own account
(checked directly, not just via the edit page's disabled checkbox, since an
HTML `disabled` checkbox never submits its value at all -- the action forces
`isActive: true` for a self-edit rather than trusting what the missing form
field would otherwise imply).

### Front desk registration (`src/app/front-desk`, `src/patients`, `src/visits`)

Implements BRS FR-3.1–FR-3.8: search patients (`searchPatients`), register a
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

**Doctor assignment and appointment scheduling are optional on the
registration form itself**, not a forced second step: `registerPatientAction`
registers the patient and, only if a doctor was chosen, also calls
`createVisit` in the same transaction (combining FR-3.2 + FR-3.4 for the
common walk-in case) -- leaving the doctor field blank just registers the
patient, matching the BRS's original separation between registration and
visit creation. The same doctor+appointment fields exist on the "Create
visit" form for patients found via search (`createVisitAction`), since both
paths funnel through the same `createVisit`. The appointment date and time
are two separate `<input type="date">`/`<input type="time">` fields (a
combined `datetime-local` picker made the time half easy to miss), combined
server-side in `combineDateAndTime` back into the single `Visit.visitDate`
(no new column) -- defaults to now but is fully editable, so front desk can
book a call-in patient for a specific future slot (e.g. an evening
appointment requested in the morning); **queue and "next patient" ordering
are based on this scheduled time, not check-in/token order** (see below).
**Patient identity is a single `name` field and a plain integer `age`**
(a later, explicitly requested simplification -- `Patient` originally had
separate `firstName`/`lastName` and a `dateOfBirth`, replaced via the
hand-written `*_patient_name_and_age` migration, which backfills existing
rows rather than dropping data: `name` from the concatenated first/last
name, `age` computed from the stored date of birth as of the migration
date). `age` is entered directly by front desk (`parseAge` in
`src/app/front-desk/actions.ts` validates a whole number, 0–150) -- it's a
snapshot as of registration, not derived from a birth date, so it does
**not** stay accurate on its own in later years the way age-from-DOB would;
that tradeoff was chosen deliberately for simplicity over long-term
accuracy. There's no more `calculateAge` helper -- every screen that used
to compute age from `dateOfBirth` now just reads `patient.age` directly.

**Token/queue number (FR-3.7/FR-3.8)**: every visit gets an
auto-assigned, display-only queue number via `generateTokenNumber`
(`src/visits/token-number.ts`), shown in the front-desk waiting queue's
"Token #" column. Three product decisions were made explicitly (not
inferable from the FRs alone, don't relitigate without revisiting them):
resets daily at **IST midnight** (`src/shared/ist-date.ts`'s
`getISTDateOnly`, fixed regardless of the server's own timezone, since this
is an Indian-market product); scoped **per hospital only**, not per
doctor/department (one shared sequence, matching a single physical token
dispenser at the front desk -- FR-3.8's "if applicable" per-doctor scoping
was declined); and it is a **display/reference number only** -- it does
NOT drive queue ordering, which stays based on `visitDate` (appointment
time) so the scheduling feature above remains meaningful. A daily-resetting
counter can't reuse the `Hospital.patientCodeSeq`/`billNumberSeq` pattern
(a single column on the one-row-per-tenant `Hospital` table can't hold a
per-day value), so it has its own table, `DailyTokenCounter`
(`daily_token_counters`, RLS-protected like every other tenant-owned
table), keyed by `(hospitalId, tokenDate)` and incremented atomically via
`INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` rather than a
read-then-write -- verified directly (not just assumed from the pattern)
that `hms_app` with no tenant context sees zero rows and can't insert, and
that a mismatched `hospital_id` in the raw SQL is rejected by the same
`WITH CHECK` clause, since this is the first raw-SQL statement in the
codebase to touch an RLS-protected table (the existing atomic counters
target `hospitals`, which has no RLS policy).

Gated to the `FRONT_DESK` role via `requireSession(['FRONT_DESK'])` (see
"Authentication" above) -- run `npm run prisma:seed` once first so a
`FRONT_DESK` user exists to log in as.

**Consultation fee collection** (not a numbered BRS/TRD FR -- a later,
explicitly requested addition) happens at the front desk itself, not later
at the billing counter: `collectConsultationFee`
(`src/billing/consultation-fee.ts`) builds and pays a standalone `Bill` (one
`SERVICE` line item, no tax) in a single step, reusing `recordPayment` so it
still shows up correctly everywhere a `Bill` does (`/billing/[billId]`,
`searchBills`, the patient longitudinal view). It's deliberately its own
function rather than a call into the billing module's `createBill` --
`createBill` also sweeps in any dispensed-but-unbilled medicine line items
for the visit, which would wrongly fold a later medicine bill into what's
meant to stay a standalone reception-desk fee. **Whether the fee amount was
actually typed in decides collect-now vs. defer**: `maybeCollectConsultationFee`
(`src/app/front-desk/actions.ts`) checks whether the `consultationFeeRupees`
field was filled in at all -- if so, it collects the fee immediately in the
same `registerPatientAction`/`createVisitAction` transaction, requiring the
payment method too; left blank, it skips collection there entirely, on the
assumption front desk will collect it later (a booked-over-the-phone
appointment whose fee isn't being paid at booking time). This was
deliberately changed from an earlier version keyed off the visit's
`visitDate` (`<= now` = walk-in) -- that comparison silently discarded a
fee front desk had actually typed in whenever the appointment time
happened to read as "in the future" (e.g. a same-day booked slot later
that afternoon), with no error and no visible sign the money wasn't
collected. Keying off the fee field instead puts the decision fully in
front desk's hands: type an amount and it's charged now, leave it blank
and it's deferred, regardless of what the appointment date/time say. The
deferred fee is always collected via the waiting queue below, whenever
front desk gets to it. **Referral discount is entered
in rupees, not a percentage** (`discountRupees` on the fee form, same
convention as the billing module's existing discount field) -- for patients
referred by a friend or relative, at front desk's discretion, no separate
"referral" record kept. **Payment method is cash, UPI, or card**
(`PaymentMethod` enum gained `CARD` for this -- the billing module's
`recordPayment` was previously UPI/Cash only, FR-7.5); selecting UPI shows
the hospital's admin-configured QR code (`UpiQrCode`, see "Hospital
branding admin" below) alongside the field, always visible when one's
configured rather than toggled on selection. For a deferred/booked
visit, the waiting queue's new "Consultation fee" column carries a
`collectConsultationFeeAction` form directly in that row (fee/discount/
payment method, all required this time since this path always collects on
the spot) once the patient arrives; a visit that's already paid shows a
`PAID` badge instead. `listWaitingQueue` (`src/visits/queue.ts`) now also
selects each visit's `PAID` bills to tell the two apart --
a `WAITING`-status visit can only ever have a `Bill` from this collection
step, since dispensing (and so a medicine bill) requires the visit to have
already passed through `IN_CONSULTATION`, so "any `PAID` bill exists"
reliably means "fee already collected," without needing to match on the
line item description.

**Other front-desk charges (surgery, procedures, etc.)** (a later, explicitly
requested addition): `collectConsultationFee` turned out to be a special
case of a more general need -- front desk billing for things besides the
consultation fee. `collectFrontDeskCharges`
(`src/billing/front-desk-charges.ts`) generalizes it to any number of named
charges combined into one `Bill` with one payment collection;
`collectConsultationFee` is now a thin wrapper that calls it with a single
`{ description: 'Consultation fee', amountCents }` charge (still its own
named function, not inlined at the call sites, since the walk-in/booked
deferral logic in `maybeCollectConsultationFee` only ever deals with this
one fee). The waiting queue's new "Other charges" column links to
`/front-desk/bill/[visitId]` (`collectFrontDeskChargesAction`) -- a small
dedicated page rather than another inline queue-row form, since entering
several charges inline in a table cell doesn't fit. That page renders a
**fixed number of blank description+amount row pairs** (`CHARGE_ROWS = 4`)
using repeated same-`name` fields (`chargeDescription` / `chargeAmount`)
rather than a dynamic add-row list -- this app has no client-side JS to grow
a form, and `FormData.getAll(...)` pairs the two arrays up by position
without needing per-row indices in the field names. A row needs both fields
filled to count toward the bill; a row with only one filled is rejected as
a mistake rather than silently dropped. Same rupee discount and cash/UPI/
card payment method as consultation-fee collection, and the resulting bill
is a normal `Bill` -- viewable at `/billing/[billId]`, searchable, and shown
in the patient longitudinal view -- indistinguishable from a
consultation-fee bill except for its line item descriptions.

### Doctor consultation (`src/app/doctor`, `src/visits`, `src/patients`)

Implements BRS FR-4.1–FR-4.12: the doctor's home screen/queue for the day
(`listVisitsForDoctor`, waiting + in-consultation + completed so a doctor
can resume one they left mid-visit or reopen one just finished), the visit
detail screen aggregating patient demographics and full visit/prescription
history (`getVisitDetail` + `getPatientHistory`), starting a consultation
(`startConsultation`: WAITING → IN_CONSULTATION only), and saving free-text
consultation notes (`saveConsultationNotes`, only while IN_CONSULTATION).
Gated to the `DOCTOR` role via `requireSession(['DOCTOR'])` (see
"Authentication" above).

**The home screen (FR-4.6–FR-4.12, added in BRS v0.3)** bounds
`listVisitsForDoctor` to the IST calendar day (`getISTDayBoundsUTC`,
`src/shared/ist-date.ts`) across all three statuses, rather than the
narrower WAITING/IN_CONSULTATION-only, no-date-bound query it used before
-- completed visits are now retained (dimmed via the `muted-section` CSS
class, not removed) so the doctor can reopen one. Per-row token number
(FR-3.7's daily counter, display-only), age (`patient.age`, entered
directly at registration -- see "Front desk registration" above), gender,
and an explicit `StatusBadge` satisfy FR-4.7. The
waiting/in-consultation/completed/total counts (FR-4.8) are derived from
the one fetched list, no extra query. The search box (FR-4.9) reuses
`searchPatients` exactly like `/patients` and `/front-desk`, linking results
to the existing `/patients/[patientId]` longitudinal view rather than a new
page. "Start next waiting patient" (FR-4.10, `src/app/doctor/actions.ts`'s
`startNextWaitingAction`) picks the earliest-`visitDate` WAITING visit
within today's IST bounds and claims it via `startConsultation` in one
transaction (pick-then-claim atomicity, distinct from `startConsultation`'s
own re-entrancy safety), then redirects into the visit detail screen --
unlike `startConsultationAction` below, which is invoked _from_ that detail
page and just revalidates in place. **Queue/next-patient ordering is by
`visitDate` (appointment time), not token number** -- a deliberate decision
so last session's appointment-scheduling feature (front desk can book a
future time slot) stays meaningful; a lower token can still be seen after a
higher one if its scheduled time is later. FR-4.12's hospital branding +
doctor's name/department are shown in the one shared nav header
(`src/app/layout.tsx`) for every role, not a doctor-specific header --
`department` was added to the signed-cookie `Session`
(`src/shared/session.ts`) at login time for this, so existing sessions
won't show it until their next login (12h TTL, no cookie migration done).

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
shown alongside patient/visit details) lists the full available-medicine
catalog (`listMedicines`) by default, so pharmacy staff can dispense
without typing anything first; the same search field (`searchMedicines`,
FR-6.3) narrows that list when useful, feeding the same table either way.
Dispensing itself is repeatable, one medicine at a time (`dispenseItem`) --
a prescription is an unstructured scanned image (BRS
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

**Adding medicine stock (FR-6.4's missing write path)**: until now, every
`Medicine` row came from `prisma/seed.mjs` -- there was no in-app way to add
one. `/pharmacy/inventory`'s "Add stock" form and `addMedicineStock`
(`src/inventory/add-stock.ts`) fill that gap, serving both onboarding a
brand-new medicine and restocking an existing one through the same fields
(name, optional batch number, unit price, quantity to add). The form is
deliberately minimal -- salt composition, expiry date, reorder level, and
the low-stock threshold override were all cut after the first pass at
pharmacy staff's request; `addMedicineStock`/`Medicine` still support all
of them (a new medicine added here just gets `reorderLevel: 0`, i.e. no
low-stock alerting until it's set some other way), so nothing downstream
broke, only the form's surface area shrank. Since `Medicine` has no
DB-level uniqueness on name/batch (see the
`inventory` bullet in "Module layout" above), `addMedicineStock` does the
dedupe itself: a case-insensitive name match with the same batch number
(including two blank batch numbers matching each other, since most stock
here isn't batch-tracked) increments that row's `stockQuantity` and
refreshes its unit price to what was just entered (plus expiry/salt
composition, for any future caller that still supplies them -- the form
itself no longer does), rather than creating a visually-duplicate second
row -- no match creates a new row.
Returns `{ medicine, merged }` so the calling action can flash a different
message for "restocked" vs. "new medicine added." This pre-check-then-write
shape (not a single atomic upsert) mirrors `createUser`/`updateUser`'s
existing duplicate-email pre-check, not `dispenseItem`'s atomic conditional
update -- acceptable here since concurrent identical restocks by the same
pharmacist aren't a realistic race, unlike concurrent dispensing.

**Finalizing dispensing hands straight into billing, same role, same
session** (a later, explicitly requested change -- see "Pharmacist billing"
below): `finalizeDispensingAction` (`src/app/pharmacy/[prescriptionId]/actions.ts`)
redirects to `/billing/new/[visitId]` on success instead of back to the
pharmacy queue, so the pharmacist who just dispensed generates and collects
the medicine bill themselves, in one continuous flow.

### Digital billing (`src/app/billing`, `src/billing`)

Implements BRS FR-7.1–FR-7.7. `/billing` lists visits with dispensed-but-
unbilled line items (`listVisitsReadyToBill`, reachable via
`Visit -> Prescription -> BillLineItem` since line items link to a visit only
through the prescription they fulfil) alongside a history search
(`searchBills`, FR-7.7: by patient name/ID or bill number, optionally a date).
`/billing/new/[visitId]` previews those unbilled items and lets the
pharmacist add one optional service charge (e.g. consultation fee, FR-7.3)
plus a discount and tax rate; `createBill` (FR-7.1/7.2) does the actual
attach: the existing unbilled `BillLineItem`s get `billId` set to the new
`Bill`, the service charge (if any) is created directly against it, and the
bill number comes from `generateBillNumber` -- same atomic
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
`PENDING`, the payment form (`recordPayment`, FR-7.5: cash, UPI, or card, no
insurance/TPA workflow -- this only records that payment happened, it
doesn't process it) is shown to the `PHARMACIST` role (see "Pharmacist
billing" below). `recordPayment` rejects a bill that's already `PAID`
(verified directly, not just via the form disappearing from the UI).
Printing uses the browser's native print (a
`<style>{'@media print {...}'}</style>` block hides the payment form/nav),
not a PDF library -- the TRD calls for server-side PDF generation, which
isn't built; this is a dependency-free stand-in worth reconsidering if a
real branded PDF becomes a hard requirement. `PrintBillButton`
(`src/app/components/PrintBillButton.tsx`) makes this discoverable as an
explicit "Print / Download PDF" button (`window.print()`) instead of
requiring staff to know the Ctrl/Cmd+P shortcut -- "download" is just the
browser's own print dialog's "Save as PDF" destination, not a separately
generated file. This is the **one deliberate exception** to the app's
no-client-components convention everywhere else: `window.print()` only
exists in the browser, so this one small piece is a `'use client'`
component, not a form/link like every other interactive element in the app.

### Pharmacist billing (no separate BILLING_STAFF role)

A later, explicitly requested change: at this hospital the pharmacist and
billing staff are the same person, so `BILLING_STAFF` was removed from
`UserRole` entirely (migration
`prisma/migrations/*_remove_billing_staff_role`, hand-written like the RLS
migrations rather than schema-diffed, since Postgres has no `ALTER TYPE ...
DROP VALUE` -- it reassigns any existing `BILLING_STAFF` users to
`PHARMACIST` first, then recreates the enum without it via the standard
create-new-type/swap-column/drop-old-type dance, since the column-type
`USING` cast would otherwise fail on rows still holding the removed value).
`PHARMACIST` is now the role gate on every billing screen/action
(`/billing`, `/billing/new/[visitId]`, `/billing/[billId]`'s payment form)
in addition to the pharmacy screens it already gated -- there's no more
separate billing-staff login or hand-off queue. `ROLE_HOME`
(`src/shared/session.ts`) and the nav header's `ROLE_LINKS`
(`src/app/layout.tsx`) were updated the same way -- `PHARMACIST` now also
gets a "Billing" nav link. `PaymentMethod` gained `CARD` alongside `UPI`/
`CASH` at the same time (previously UPI/Cash only, FR-7.5) for this same
merged role to record any of the three at `/billing/[billId]`.

The UX consequence, not just the permission change: `finalizeDispensingAction`
(see "In-house medical store / pharmacy" above) now redirects the pharmacist
straight into `/billing/new/[visitId]` instead of back to the pharmacy
queue, so "prescription dispensed" flows directly into "bill generated by
the same person" in one sitting -- matching how this hospital actually
staffs the two jobs as one, rather than the original design's separate
pharmacy-queue-then-billing-queue hand-off between two different roles.

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
scripting against it outside the real form. `logoUrl`/`upiQrCodeUrl` are the
one exception to that full-overwrite rule: since a `<input type="file">` is
never pre-filled with the existing upload, submitting the form again
without choosing a new file leaves the existing one in place (`...(input.X
? { X: input.X } : {})`) rather than nulling it out -- otherwise re-saving
any other field would silently delete the logo/QR code.

**UPI QR code** (a later, explicitly requested addition, not a numbered
BRS/TRD FR): `upiQrCodeUrl` on `Hospital` is an admin-uploaded image
(`saveHospitalUpiQrCode` in `src/shared/storage.ts`, same shape as
`saveHospitalLogo` -- the hospital's own QR exported from whatever UPI app
they already use to collect payments, not something generated from a raw
UPI ID/VPA). `UpiQrCode` (`src/app/components/UpiQrCode.tsx`) renders it
wherever staff can pick UPI as a payment method -- front desk's
consultation-fee/other-charges collection and the pharmacist's bill payment
form -- and is **always shown when configured, not toggled based on which
payment method is currently selected**: this app has no client-side JS to
react to a `<select>`'s live value (the one exception, `PrintBillButton`,
exists only because `window.print()` has no non-JS equivalent at all), so a
small always-visible, clearly labeled code is the dependency-free
alternative to a dynamic show/hide. Only `HOSPITAL_ADMIN` can upload one
(the same role gate as the rest of this screen); it never appears on the
printable invoice itself (rendered inside the same `no-print` section as
the payment form).

### Local infra

`docker-compose.yml` runs a single `postgres:16-alpine` service (user/pass/db =
`hms`/`hms`/`hms`, port 5432, named volume `hms_postgres_data`). `.env.example`
has the matching `DATABASE_URL`.
