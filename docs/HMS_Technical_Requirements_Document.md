# Technical Requirements Document
## Multi-Tenant Hospital Management System (HMS)

Low-Maintenance, Low-Cost Architecture — Built and Maintained with Claude Code

**Document Type:** Technical Requirements Document (TRD)
**Version:** 0.1 (Draft for Review)
**Date:** 24 July 2026
**Companion document to:** HMS Business Requirement Specification v0.2

---

## Document Control

| Version | Date | Author | Description |
|---|---|---|---|
| 0.1 (Draft) | 24 Jul 2026 | Engineering/BA Team | Initial Technical Requirements Document (TRD), derived from the approved Business Requirement Specification v0.2 |

---

## 1. Introduction

### 1.1 Purpose
This Technical Requirements Document (TRD) translates the approved Business Requirement Specification (BRS v0.2) into a concrete, buildable technical design: architecture, technology stack, hosting, integrations, security, and the development/maintenance approach. It is written specifically to satisfy two stated business priorities: the platform must be robust, and its ongoing hosting/subscription and maintenance costs must be minimal.

### 1.2 Guiding Principles
- Boring, proven technology over novelty — fewer moving parts means less to break and less to pay for.
- One deployable application (a "modular monolith") instead of microservices — microservices add operational cost and complexity not justified at this scale.
- Open-source, no-license-fee components wherever they meet the requirement, to avoid recurring software licensing cost.
- Shared infrastructure across all hospitals (multi-tenant), not one server/database per hospital — this is the single biggest lever for keeping per-hospital cost low.
- Pay-as-you-go third-party services (SMS/WhatsApp, payment confirmation) instead of services with large fixed monthly minimums.
- Everything defined as code (application, infrastructure config, database schema) so the system is reproducible, auditable, and maintainable primarily through Claude Code rather than manual, undocumented server changes.

### 1.3 Key Assumption on "Built Completely Using Claude"
This is interpreted, and the rest of this document is written on that basis, as follows:
- The application's code, tests, documentation, and infrastructure configuration will be authored and maintained using **Claude Code**, in place of a large traditional in-house development team. This is a development-process decision that reduces engineering headcount cost — see Section 10.
- It does **not** mean the live, production hospital application calls the Claude API at runtime for its core workflows (registration, prescription upload, billing). Those are deterministic business processes built as regular application logic — cheaper, faster, and more reliable to run than routing them through an AI model at runtime.
- Optional future AI-assisted features (e.g. OCR/summarization of scanned prescriptions using Claude's vision capability, flagged as out of scope in the BRS) could later call the Claude API at runtime — that would add a small, usage-based API cost at that time, separate from hosting cost. Noted as a future option in Section 12, not part of the current build.

### 1.4 Relationship to the Business Requirement Specification
Every functional requirement (FR-x.x) and non-functional requirement in the BRS is expected to be satisfied by the architecture in this document. Section 4 maps BRS modules to technical components; Section 8 maps BRS non-functional/compliance requirements to concrete technical controls.

---

## 2. Architecture Overview

### 2.1 Architectural Style
A **modular monolith**: a single, well-organized application codebase and a single deployable unit, internally divided into clear modules that mirror the BRS (Registration, Consultation, Prescription, Pharmacy/Inventory, Billing, Admin/Branding). Chosen over microservices because:
- One service to deploy, monitor, patch, and pay for, instead of many.
- No inter-service network calls, message brokers, or service-mesh tooling to build, run, or troubleshoot.
- Module boundaries are still kept clean in code, so parts of the system could be split out later if genuine scale ever requires it (Section 12) — the cost saving is in not paying for that complexity before it's needed.

### 2.2 High-Level Layers

| Layer | Responsibility |
|---|---|
| Presentation | Web-based, responsive screens for Front Desk, Doctor, Pharmacy/Billing, and Hospital/Super Admin, usable on desktops and tablets. |
| Application/API | Business logic for registration, consultation, prescription upload & routing, inventory, billing, branding, and role-based access. |
| Data | A single relational database holding all tenants' data, logically separated by a tenant identifier on every record. |
| File/Object Storage | Scanned prescription images/PDFs, hospital logos, and generated bill/invoice PDFs. |
| Cross-Cutting | Authentication & authorization, audit logging, scheduled jobs (e.g. low-stock checks), notifications/digital delivery. |

### 2.3 Multi-Tenancy Model
Recommended approach: a single shared database with a shared schema, where every tenant-owned table carries a `hospital_id` column, combined with **PostgreSQL Row-Level Security (RLS)** policies that make it physically impossible for one hospital's query to read or write another hospital's rows, even if application code has a bug.

Why this over a separate database per hospital:
- **Cost:** one small database instance can comfortably serve many small-to-mid-sized hospitals; a database-per-hospital model multiplies hosting cost roughly in proportion to the number of hospitals onboarded.
- **Maintenance:** one schema to migrate, back up, and patch, instead of N separate databases drifting out of sync over time.
- Isolation is still enforced at the database layer (RLS), not just trusted to application code.

If a future hospital ever contractually requires fully dedicated infrastructure, that hospital alone can be moved to an isolated database without redesigning the rest of the platform.

---

## 3. Technology Stack

All choices are open-source/no-license-fee and widely supported, to avoid recurring software licensing cost and reduce key-person dependency.

| Layer | Recommended Choice | Why (cost & maintenance rationale) |
|---|---|---|
| Frontend | Next.js (React + TypeScript) | One framework for all four staff-facing screens; responsive for desktop and tablet use; large ecosystem so Claude Code has strong training coverage. |
| Backend/API | Same Next.js application (API routes/server actions) | Avoids running and hosting a second backend service — one deployable, one hosting bill. |
| Database | PostgreSQL | Free, open-source, extremely robust; native Row-Level Security supports the multi-tenancy model without extra tooling. |
| ORM/Migrations | Prisma | Type-safe queries and version-controlled schema migrations; makes Claude-Code-driven schema changes safer and auditable. |
| File/Object Storage | S3-compatible object storage (e.g. Cloudflare R2 class of service) | Pay only for storage used, no server to maintain, no data-egress fee on the R2 class of service. |
| Authentication | Self-hosted session/JWT-based auth with hashed passwords (bcrypt/argon2) and role middleware | Avoids per-user recurring fees charged by hosted identity providers; still industry-standard, well-audited libraries. |
| Hosting/Compute | Single small Linux server (VM/VPS), Dockerized app — see Section 6 | Predictable flat monthly cost; one shared server serves all tenants. |
| Reverse Proxy/SSL | Caddy or Nginx with Let's Encrypt | Free, auto-renewing SSL certificates; no paid load-balancer product needed at this scale. |
| Background/Scheduled Jobs | In-process scheduler (e.g. node-cron) for tasks like low-stock checks | No separate message-queue/worker infrastructure needed at current scale. |
| SMS/WhatsApp Delivery | Pay-as-you-go Indian messaging API provider | No fixed monthly platform fee; cost scales with actual messages sent, matching FR-10.3. |
| Payment Confirmation (UPI/Cash) | UPI collected via hospital's existing UPI QR/handle; system records payment reference only | Per FR-7.5 no online payment processing/insurance is required — avoids payment-gateway subscription/transaction fees entirely. |
| CI/CD | GitHub Actions | Free tier sufficient at this scale; automates test-and-deploy. |
| Monitoring/Uptime | Free-tier uptime checks plus built-in application logs | Avoids paid APM subscriptions not justified at current scale. |
| Backups | Scheduled automated database dumps to object storage | Uses the same low-cost object storage already in the stack. |

---

## 4. BRS Module → Technical Component Mapping

| BRS Module | Technical Implementation |
|---|---|
| 3.1 Multi-Tenant & Branding | Tenant configuration table (name, logo file reference, theme color, address); logo served from object storage; theme applied via CSS variables at render time. |
| 3.2 User & Role Management | Users table scoped by hospital_id; role field drives UI navigation and API-level authorization checks; audit log table records sensitive actions. |
| 3.3 Front Desk / Registration | Patient and Visit modules; server-side search on name/phone/patient ID with hospital-scoped indexes. |
| 3.4 Doctor Consultation | Visit detail view aggregating patient history, prior prescriptions, and notes; queue view filtered by assigned doctor and status. |
| 3.5 Prescription Digitization & Routing | Upload endpoint accepts image/PDF, stores it in object storage, writes a Prescription record linked to the Visit, and flips a status flag the Pharmacy queue reads — this is the "automatic routing" (no message broker needed at this scale). |
| 3.6 In-House Medical Store | Inventory table per hospital with quantity and configurable low-stock threshold; dispensing decrements stock in the same transaction that marks the prescription dispensed. |
| 3.7 Digital Billing | Bill/Invoice module generated from dispensed line items plus optional consultation fee; GST calculation and PDF generation server-side; UPI/Cash payment reference recorded against the bill. |
| 3.8 Patient Record | A read view joining Patient, Visit, Prescription, and Bill, scoped to hospital_id, with search/filter. |
| 3.9 Reporting & Dashboards | Scheduled/aggregation queries against the same database — no separate analytics/data-warehouse product needed at current data volumes. |
| 3.10 Notifications & Digital Delivery | On bill/prescription finalization, a job sends via the SMS/WhatsApp provider and logs delivery success/failure. |

---

## 5. Data Model Summary

Detailed field-level schema is maintained as versioned Prisma migration files in the codebase (the source of truth), not duplicated here.

| Entity | Tenant-Scoped? | Key Relationships |
|---|---|---|
| Hospital (Tenant) | N/A — root entity | Parent of all other entities via hospital_id. |
| User | Yes | Belongs to Hospital; referenced by Visit (assigned doctor), Prescription (uploading doctor), Audit Log. |
| Patient | Yes | Belongs to Hospital; has many Visits. |
| Visit | Yes | Belongs to Patient and Hospital; has one Prescription (typically) and one Bill; assigned to one doctor (User) — Phase 1. |
| Prescription | Yes | Belongs to Visit; stores object-storage reference to the scanned file; drives the pharmacy queue. |
| Medicine (Inventory Item) | Yes | Belongs to Hospital; referenced by Bill line items; carries current stock and configurable low-stock threshold. |
| Bill / Invoice | Yes | Belongs to Visit and Patient; has many line items referencing Medicines and/or service charges. |
| Audit Log | Yes | References the acting User and the affected entity/record. |

*PostgreSQL Row-Level Security policies are defined so that every query automatically filters by the current session's hospital_id, enforced at the database engine level as a second line of defence beneath application-layer checks.*

---

## 6. Hosting & Infrastructure Plan

### 6.1 Deployment Options Compared

|  | Option A — Self-Managed VPS | Option B — Managed PaaS |
|---|---|---|
| Description | One small Linux VPS running the Dockerized app, database, and reverse proxy. | Managed application hosting plus a managed Postgres add-on. |
| Monthly cost (indicative) | Lowest — roughly USD 20–30 total. | Slightly higher — roughly USD 35–50 total, for reduced hands-on server administration. |
| Maintenance burden | Slightly higher — OS updates and server hardening are the team's/Claude Code's responsibility, guided by scripted, version-controlled server configuration. | Lower — the platform handles OS patching, scaling, and managed backups. |
| Recommendation | **Recommended starting point**, given the priority on minimizing subscription cost, since infrastructure-as-code keeps admin overhead low despite being self-managed. | Reasonable fallback if the team later prefers to trade cost for less server administration. |

Either option keeps the same application code and Docker packaging, so switching later is a configuration change, not a rebuild.

### 6.2 Environments
- **Production:** the live multi-tenant application used by all onboarded hospitals.
- **Staging/Preview:** a lightweight environment (can be spun up on-demand rather than run continuously) used to verify changes before they reach production.
- **Local development:** run via Docker Compose on a developer's machine, mirroring production configuration.

### 6.3 Indicative Monthly Running Cost (Platform-Wide, Not Per Hospital)
Indicative figures, to be validated with actual vendor pricing at build time. All costs are platform-wide — shared across every hospital on the platform.

| Cost Item | Indicative Monthly Cost (USD) | Notes |
|---|---|---|
| Application + database server (Option A) | 20 – 30 | Single VPS sized for early tenant volumes; upgradeable without re-architecture. |
| Object storage (prescriptions, logos, invoice PDFs) | 1 – 5 | Scales with data volume; no egress fee on the recommended storage class. |
| Domain name | ~1 (amortized) | Annual renewal, amortized monthly. |
| SSL certificates | 0 | Free, auto-renewing. |
| SMS/WhatsApp delivery | Usage-based, a few cents per message | Scales with number of bills/prescriptions delivered digitally. |
| CI/CD, monitoring, backups | 0 | Covered by free tiers at current scale. |
| **Estimated platform total** | **≈ 25 – 40** (excluding message volume) | Shared across all onboarded hospitals; does not grow linearly per hospital added. |

*Because this cost is shared platform-wide rather than duplicated per hospital, the flat subscription fee per hospital is expected to comfortably cover infrastructure cost even at a modest number of onboarded hospitals, with margin improving as more hospitals join.*

---

## 7. Integrations

### 7.1 Prescription Capture (Scanner/Camera)
- The upload screen accepts files from any connected document scanner's driver-produced file (image/PDF) or from a tablet/phone camera capture, avoiding dependency on any single scanner brand or paid scanning SDK.
- Client-side image compression before upload keeps storage and bandwidth cost low.

### 7.2 SMS / WhatsApp / Email Delivery
- A provider abstraction in code allows switching providers if pricing changes, avoiding lock-in.
- Email delivery (for bill/prescription copies) can use a free-tier transactional email service at current volumes.

### 7.3 UPI & Cash Payment Recording
- Per BRS FR-7.5, the system records that a UPI or Cash payment was made against a bill (amount, method, reference/UTR number, timestamp) — staff enter this after collecting payment via the hospital's existing UPI QR code or in cash.
- Avoids the monthly/percentage fees of a full payment-gateway integration entirely.

### 7.4 GST-Compliant Invoicing
- Bill/invoice PDFs generated server-side with hospital details, GSTIN (if applicable), itemized medicines/services, tax breakup, and total — using an open-source PDF generation library.

---

## 8. Security & Compliance Implementation

| BRS Requirement | Technical Control |
|---|---|
| Strict data isolation between hospitals | hospital_id on every tenant-owned table plus PostgreSQL Row-Level Security policies, enforced regardless of application-layer bugs. |
| Role-based access control | Server-side authorization checks on every API route, driven by the authenticated user's role and hospital. |
| Encryption in transit | HTTPS/TLS enforced everywhere via the reverse proxy. |
| Encryption at rest | Disk-level encryption on hosting provider's storage volumes, plus encrypted object storage for prescription scans. |
| Audit trail | Append-only Audit Log entity recording who did what, when, on which record. |
| DPDP Act, 2023 alignment | Explicit patient consent capture at registration for digital communication; documented data-retention policy; supported data export/delete workflow. |
| IT Act, 2000 reasonable security practices | Password hashing (bcrypt/argon2), rate limiting on login, session expiry, least-privilege database credentials. |
| Backup & disaster recovery | Automated daily encrypted database backups to object storage, retained on a defined schedule, with periodic restore drills. |

*A qualified legal/compliance review of DPDP Act obligations is recommended before go-live; this document defines the technical controls that support compliance but does not itself constitute legal advice.*

---

## 9. DevOps & CI/CD
- All application code, database migrations, and infrastructure configuration are kept in a single version-controlled Git repository — editable and reviewable through Claude Code.
- GitHub Actions runs automated tests on every change and deploys to production only after tests pass.
- Given expected traffic levels, a brief restart-based deploy is acceptable and avoids the added cost/complexity of a zero-downtime blue-green setup; revisit if usage grows.
- Infrastructure is defined as code (Docker Compose / equivalent configuration files) so a server can be rebuilt quickly if needed.

---

## 10. Development & Maintenance Approach (Claude Code)

### 10.1 Build Approach
- The application is built primarily by directing Claude Code against the codebase: implementing modules, writing tests, producing/maintaining documentation.
- A lean human role (a single technical lead/reviewer) sets direction, reviews and approves changes before they merge, and handles judgment calls Claude Code should not make unsupervised — security-sensitive changes, production data operations, compliance-related decisions.

### 10.2 Testing Strategy
- Automated tests (unit and integration) are written alongside each feature and run in CI on every change.
- Core flows carrying the highest test priority: patient registration, prescription routing, stock deduction on dispensing, and bill totals.

### 10.3 Ongoing Maintenance Workflow
1. A bug or change request is captured (e.g. as a tracked issue).
2. Claude Code is directed to investigate and implement the fix/change, including updating or adding tests.
3. The human technical lead reviews the change, particularly for security, data-isolation, and compliance impact.
4. CI runs the automated test suite; on success, the change deploys via the pipeline in Section 9.
5. For urgent production issues, the same workflow applies on an expedited basis rather than through undocumented manual server changes.

### 10.4 Limitations to Plan Around
- AI-assisted development speeds up building and maintaining code, but does not replace a qualified human sign-off on security-sensitive and compliance-sensitive changes.
- Periodic independent security review is recommended before go-live and at a sensible cadence afterward.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Single VPS is a single point of failure | Automated, tested backups plus infrastructure-as-code allow a fast rebuild on a new server; managed PaaS or a standby server can be adopted later if uptime requirements tighten. |
| Shared multi-tenant database means a schema bug could theoretically affect multiple hospitals at once | Row-Level Security as a database-enforced safety net, staged rollouts through CI, automated tests on core flows before every deploy. |
| Heavy reliance on Claude Code for ongoing maintenance | Mandatory human review step for merges, version-controlled history for full traceability, documentation kept current as part of the workflow. |
| Messaging/SMS provider price or reliability changes | Provider-abstraction layer allows switching vendors without touching the rest of the application. |
| Regulatory (DPDP) requirements evolve | Data model already isolates and scopes patient data per hospital with audit logging in place. |

---

## 12. Scalability & Future Roadmap
- Vertical scaling first: increase the VPS's CPU/RAM as tenant/data volume grows — cheapest scaling step, no architecture change.
- Move to a managed Postgres instance (still a single database with RLS) once backup/uptime requirements outgrow self-managed comfort.
- Split out the highest-load module (most likely reporting/analytics) into its own service only if and when it actually contends with core transactional traffic.
- Optional future AI-assisted features (e.g. Claude-vision-based OCR of scanned prescriptions) could be added as an opt-in module with its own usage-based cost, once core operations are stable.
- Multi-doctor/multi-department visits and purchase-order/supplier tracking for inventory (both flagged in the BRS as later-phase items) fit within the existing data model as additive changes, not a redesign.

---

## 13. Open Items for Confirmation
1. Confirm Option A (self-managed VPS) vs Option B (managed PaaS) as the initial hosting choice — this document recommends Option A on cost grounds.
2. Confirm the preferred SMS/WhatsApp provider for digital delivery of bills/prescriptions, as pricing and WhatsApp Business API approval timelines vary by provider.
3. Confirm data-retention duration for patient records and prescription scans, to finalize the backup/retention and DPDP-aligned deletion policy.
4. Confirm whether a staging environment should run continuously or be spun up on demand, given the cost-minimization objective.

---

## 14. Next Steps
1. Confirm the open items in Section 13.
2. Set up the version-controlled repository, base project scaffold, and CI/CD pipeline.
3. Define the initial Prisma schema and Row-Level Security policies for the entities in Section 5.
4. Begin Claude-Code-driven build of the MVP modules in BRS priority order (Must Have items first), with automated tests from the outset.
5. Provision the chosen hosting option and deploy a first working environment for hands-on review with hospital stakeholders.
