# Business Requirement Specification
## Multi-Tenant Hospital Management System (HMS)

Front Desk Registration • Doctor Consultation • Digital Prescription Routing • In-House Pharmacy • Digital Billing

**Document Type:** Business Requirement Specification (BRS)
**Version:** 0.2 (Draft for Review)
**Date:** 24 July 2026

---

## Document Control

| Version | Date | Author | Description |
|---|---|---|---|
| 0.1 (Draft) | 24 Jul 2026 | Product/BA Team | Initial Business Requirement Specification (BRS) for review |
| 0.2 (Draft) | 24 Jul 2026 | Product/BA Team | Incorporated stakeholder decisions on scope, compliance, inventory alerts, subscription model, and payment methods (Section 8) |

---

## 1. Introduction

### 1.1 Purpose
This document defines the business and functional requirements for a Hospital Management System (HMS) that digitizes the patient journey from front-desk registration through doctor consultation, prescription capture, in-house pharmacy dispensing, and billing. It is intended to align stakeholders on "what" the system must do before technical architecture and implementation planning ("how") begin in the companion Technical Requirements Document.

### 1.2 Scope
The system covers the following core workflow for a single patient visit:

1. Front desk staff digitally captures patient demographic and visit information at registration.
2. The doctor views the patient's information and history on screen as the patient arrives at the consultation cabin.
3. The doctor writes a prescription by hand on paper, as per existing clinical practice.
4. The handwritten prescription is scanned and uploaded against the patient's digital record.
5. On upload, the prescription is automatically routed to the in-house medical store (pharmacy) queue.
6. The pharmacy dispenses medicines and generates a digital bill, which is attached to the patient's record.

*The system is designed as a multi-tenant, white-label product: a single codebase/platform instance that can be configured per hospital with that hospital's name, logo, and basic branding, enabling the same solution to be licensed and sold to multiple hospitals independently.*

### 1.3 Intended Audience
- Hospital administrators and clinical operations stakeholders (business sponsors)
- Product and business analysis team
- Technical/engineering team (Technical Requirements phase)
- QA and training teams

### 1.4 Definitions, Acronyms and Abbreviations
- **HMS** – Hospital Management System
- **Tenant** – An individual hospital/clinic instance configured within the shared platform
- **EHR** – Electronic Health Record
- **OPD** – Out-Patient Department
- **SKU** – Stock Keeping Unit (used loosely here for a medicine/item in inventory)
- **White-label** – Rebrand-able software sold under each customer's own name/logo

### 1.5 Product Vision
Build one configurable HMS product — not a bespoke build per customer — so that onboarding a new hospital is primarily a configuration exercise (name, logo, colors, departments, user accounts) rather than new development. Each hospital's data must remain logically isolated from every other hospital using the platform.

---

## 2. Overall Description

### 2.1 Product Perspective
The HMS is a new, standalone, cloud-deliverable software product (SaaS-style) offered to multiple independent hospitals from a shared platform. Each hospital operates as an isolated tenant with its own users, patients, inventory, and branding, while the underlying application logic and codebase are shared across all tenants.

### 2.2 User Classes and Characteristics

| Role | Description | Primary Goals |
|---|---|---|
| Super Admin (Platform Owner) | Manages the SaaS platform across all hospital tenants. | Onboard new hospitals, manage subscriptions/licensing, monitor platform health. |
| Hospital Admin | Hospital-side administrator for a single tenant. | Configure branding, manage staff accounts, departments, and hospital-specific settings. |
| Front Desk / Registration Staff | First point of contact for patients. | Capture patient demographics, create visits, assign patients to doctors/queues. |
| Doctor | Consults patients and issues prescriptions. | View patient history, scan/upload handwritten prescription, mark consultation complete. |
| Pharmacist / Medical Store Staff | Manages the in-house pharmacy. | Receive digital prescriptions, verify stock, dispense medicines, generate bills. |
| Billing Staff | Manages billing and payments (may overlap with pharmacist role). | Generate consolidated bills, record payments, issue receipts/invoices. |
| Patient (optional, future phase) | End recipient of care. | View own records, prescriptions, and bills, if a patient portal is enabled. |

### 2.3 Operating Environment (High Level)
- Accessible via standard web browsers on desktop/laptop devices at front desk and pharmacy counters.
- Supports connection to a document/image scanner (or camera-based capture, e.g. via tablet/phone) at the doctor's cabin for prescription upload.
- Deployable in a way that supports onboarding multiple hospitals without code changes per hospital.

### 2.4 Assumptions
- Doctors will continue to write prescriptions on paper; the system does not require doctors to type prescriptions (though this may be a future enhancement).
- Each hospital site will have basic infrastructure: computers/tablets at front desk, doctor cabins, and pharmacy, plus a scanner or camera-capable device and internet connectivity.
- A single patient visit follows a linear path: registration → doctor consultation → pharmacy → billing. Multi-department/multi-doctor visits in one day are a future consideration (see Section 7).
- Each hospital (tenant) has its own in-house medical store; the system is not modeling external/retail pharmacy chains in this phase.

### 2.5 Commercial / Licensing Model
The product shall be offered to each hospital on a flat subscription basis, priced in line with what the Tier-2 Indian city hospital market can bear (as opposed to per-bed, per-user, or usage-based pricing at this stage). The Super Admin shall manage each hospital's subscription/tenant status (see FR-1.6); detailed pricing tiers and billing-of-the-hospital-itself (as distinct from patient billing) are a commercial/business decision outside this document's scope.

### 2.6 Constraints
- Patient health data is sensitive; the system must support hospital-specific compliance needs (e.g. local health data protection regulations) — see Decision #3 in Section 8.
- The prescription itself remains an image/PDF scan of a handwritten document in this phase, not structured, machine-readable text — downstream automation (e.g. auto-checking drug interactions) is therefore limited unless OCR is introduced later.

---

## 3. System Features / Functional Requirements

Priority: **M** = Must Have (MVP), **S** = Should Have, **C** = Could Have / future phase.

### 3.1 Multi-Tenant & Hospital Branding Management

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | The system shall allow a new hospital (tenant) to be onboarded with a unique identifier, without affecting other hospitals' data. | M |
| FR-1.2 | The system shall allow each hospital to upload/configure its own logo, hospital name, address, and contact details. | M |
| FR-1.3 | The system shall apply the configured hospital name and logo across the UI, printed prescriptions/bills, and any patient-facing documents for that tenant. | M |
| FR-1.4 | The system shall allow basic theme personalization (e.g. primary color) per hospital. | S |
| FR-1.5 | The system shall ensure that data belonging to one hospital (patients, users, inventory, bills) is never visible to another hospital. | M |
| FR-1.6 | The system shall allow a platform-level Super Admin to manage the list of onboarded hospitals and their subscription/status (active/suspended). | M |

### 3.2 User & Role Management

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | The system shall support role-based accounts: Super Admin, Hospital Admin, Front Desk, Doctor, Pharmacist/Medical Store, Billing Staff. | M |
| FR-2.2 | The Hospital Admin shall be able to create, edit, deactivate user accounts and assign roles/departments within their own hospital. | M |
| FR-2.3 | The system shall restrict each user's visible screens and actions according to their assigned role. | M |
| FR-2.4 | The system shall require authentication (username/password at minimum) for all staff logins. | M |
| FR-2.5 | The system shall log user actions (who registered/edited/uploaded/dispensed what and when) for audit purposes. | S |

### 3.3 Front Desk / Patient Registration Module

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Front desk staff shall be able to search for an existing patient (e.g. by name, phone number, or patient ID) to avoid duplicate records. | M |
| FR-3.2 | Front desk staff shall be able to register a new patient by capturing demographic details (name, age/DOB, gender, contact number, address, and other standard intake fields). | M |
| FR-3.3 | The system shall auto-generate a unique patient ID per hospital upon registration. | M |
| FR-3.4 | Front desk staff shall be able to create a new visit/encounter for a patient and assign it to a specific doctor/department. | M |
| FR-3.5 | The system shall maintain a queue/list view showing which patients are waiting for which doctor. | S |
| FR-3.6 | The system shall allow front desk staff to update a patient's demographic details on subsequent visits. | M |

### 3.4 Doctor Consultation Module

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | As a patient reaches the doctor's cabin, the doctor shall be able to view that patient's registered information and past visit/prescription history on screen. | M |
| FR-4.2 | The system shall show the doctor a queue of patients assigned to them for the day. | S |
| FR-4.3 | The doctor shall be able to open a specific patient's visit to begin consultation (marking status as "in consultation"). | M |
| FR-4.4 | The doctor shall be able to capture brief consultation notes (free text) in addition to the scanned prescription (optional, non-mandatory field). | S |
| FR-4.5 | The doctor shall be able to mark a consultation as complete once the prescription is uploaded. | M |

### 3.5 Prescription Digitization & Routing

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | The doctor (or assisting staff) shall be able to scan the handwritten paper prescription using a connected scanner or camera-capable device. | M |
| FR-5.2 | The system shall allow the scanned prescription (image or PDF) to be uploaded and attached to the current patient visit record. | M |
| FR-5.3 | The system shall support common image/PDF formats for the uploaded prescription and enforce a reasonable maximum file size. | M |
| FR-5.4 | Upon successful upload, the system shall automatically route/notify the in-house medical store that a new prescription is ready for dispensing, without requiring manual handoff. | M |
| FR-5.5 | The system shall timestamp and retain the original uploaded prescription image against the patient's permanent record. | M |
| FR-5.6 | The system shall allow re-upload/replacement of a prescription scan if the doctor identifies an error, while retaining an audit trail of the change. | S |

### 3.6 In-House Medical Store (Pharmacy) Module

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | The medical store staff shall receive newly uploaded prescriptions in a queue/worklist, viewable in order of arrival. | M |
| FR-6.2 | Medical store staff shall be able to view/zoom the scanned prescription image alongside the patient's visit details. | M |
| FR-6.3 | Medical store staff shall be able to search and select medicines from the hospital's inventory to fulfil the prescription. | M |
| FR-6.4 | The system shall maintain a basic medicine inventory (name, stock quantity, unit price, expiry) per hospital. | M |
| FR-6.5 | The system shall deduct dispensed quantities from inventory stock upon confirming dispensation. | M |
| FR-6.6 | The system shall raise a low-stock alert for a medicine when its remaining stock falls to or below a configurable threshold percentage of its reference/reorder stock level (default: 30%). | M |
| FR-6.7 | The low-stock threshold shall be configurable per hospital by the Hospital Admin (not hard-coded), and shall be adjustable per medicine where needed. | M |
| FR-6.8 | The low-stock alert shall be visible to medical store staff on their dispensing/inventory screen, and to the doctor when prescribing, so the doctor is aware stock is limited. | M |
| FR-6.9 | The system shall additionally flag near-expiry medicines to medical store staff. | S |
| FR-6.10 | The system shall mark a prescription as "dispensed" once medicines are issued, updating its status on the patient's record. | M |

### 3.7 Digital Billing Module

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | The system shall allow medical store/billing staff to generate a digital bill listing the medicines dispensed, quantities, and prices. | M |
| FR-7.2 | The system shall automatically attach the generated bill to the corresponding patient's visit record. | M |
| FR-7.3 | The system shall support adding consultation fees or other hospital service charges to the same bill, where applicable. | S |
| FR-7.4 | The system shall calculate applicable taxes (including GST, per Indian billing norms), discounts, and the final payable amount. | M |
| FR-7.5 | The system shall allow recording of payment via UPI or Cash only, and mark the bill as paid/pending. No insurance or third-party administrator (TPA) claim workflow is supported at this stage. | M |
| FR-7.6 | The system shall allow printing or exporting a bill/invoice with the hospital's name and logo. | M |
| FR-7.7 | The system shall maintain a billing history searchable by patient, date, or bill number. | S |

### 3.8 Patient Record (Longitudinal View)

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | The system shall provide a single consolidated view per patient showing all past visits, uploaded prescriptions, and bills. | M |
| FR-8.2 | Authorized staff shall be able to open any past prescription scan and bill from the patient's record. | M |
| FR-8.3 | The system shall allow filtering/search of patient records by name, ID, phone number, or visit date. | M |

### 3.9 Reporting & Dashboards

| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | The system shall provide the Hospital Admin a basic dashboard showing daily patient count, consultations completed, and revenue collected. | S |
| FR-9.2 | The system shall provide the medical store a report of medicines dispensed and stock levels over a selected date range. | S |
| FR-9.3 | The system shall allow the Super Admin to view basic usage metrics across hospitals (e.g. active tenants, users). | C |

### 3.10 Notifications & Patient Digital Delivery

| ID | Requirement | Priority |
|---|---|---|
| FR-10.1 | The system shall notify medical store staff (e.g. on-screen alert, badge count) when a new prescription arrives. | S |
| FR-10.2 | The system may notify front desk when a patient's consultation is complete and they should proceed to the pharmacy/billing counter. | C |
| FR-10.3 | The system shall be able to deliver the patient's bill and/or prescription digitally (e.g. SMS, WhatsApp, or email) once available, subject to the patient providing contact details and opting in. | M |
| FR-10.4 | The system shall log whether digital delivery to the patient succeeded, for staff to fall back to a printed copy if needed. | S |

---

## 4. Patient Journey — Process Overview

1. **Registration:** Front desk captures/looks up patient details and creates a visit, assigning a doctor/department.
2. **Waiting/Queue:** Patient waits; their entry appears in the assigned doctor's queue.
3. **Consultation:** Doctor opens the patient's record, reviews history, examines the patient, and writes a prescription on paper.
4. **Digitization:** Prescription is scanned and uploaded against the visit.
5. **Routing:** System automatically pushes the prescription to the medical store queue.
6. **Dispensing:** Medical store staff view the prescription, select medicines from inventory, and dispense them.
7. **Billing:** A digital bill is generated for the dispensed medicines (and optionally consultation/service fees), attached to the patient record, and payment is recorded.
8. **Record Keeping:** The complete visit — registration data, prescription scan, and bill — is retained in the patient's longitudinal record for future reference.

---

## 5. Non-Functional Requirements

### 5.1 Security & Data Privacy
- Strict logical data isolation between hospitals (tenants); no cross-tenant data access.
- Role-based access control enforced on every screen and action.
- Encryption of sensitive data in transit; encryption at rest for patient records and prescription images.
- Full audit trail of who viewed/edited/uploaded/dispensed what, and when.

### 5.2 Compliance
Confirmed scope: the system targets the standard Indian market compliance baseline:
- Digital Personal Data Protection Act (DPDP), 2023 — patient consent for data collection/use, purpose limitation, and data retention/deletion practices for patient records and prescription images.
- Reasonable security practices under the IT Act, 2000 (and associated rules) for handling sensitive personal data.
- GST-compliant billing/invoicing for all patient bills.
- Should the platform later be sold outside India, additional region-specific compliance will need to be assessed at that time.

### 5.3 Availability & Performance
- The system should be available during hospital operating hours with minimal downtime.
- Prescription upload and routing to the medical store should complete within a few seconds under normal load.

### 5.4 Usability
- Interfaces for front desk, doctor, and pharmacy staff should be simple enough to use with minimal training.
- The doctor-facing screen should minimize clicks between opening a patient and uploading a prescription.

### 5.5 Scalability & Multi-Tenancy
- Onboarding a new hospital should require configuration only, not new development or a separate deployment per hospital.
- The system should support a growing number of hospitals, users, and patient records without redesign.

### 5.6 Localization
- The system's default configuration targets the Indian market: currency in INR (₹), Indian date format (DD-MM-YYYY), and GST-compliant invoice layout.
- The underlying design should still allow hospital-specific settings (currency, date format, and, in later phases, regional language) for future markets.

---

## 6. High-Level Data Entities

| Entity | Key Attributes (indicative) | Notes |
|---|---|---|
| Tenant / Hospital | Hospital name, logo, address, contact info, subscription plan, theme/branding config | Root entity for multi-tenancy |
| User | Name, role, credentials, department, hospital (tenant) reference | Scoped per tenant |
| Patient | Name, age/DOB, gender, contact, address, patient ID (per tenant), medical history flags | Unique per tenant |
| Visit / Encounter | Visit date/time, patient ref, doctor assigned, department, status (waiting/in-consult/completed) | One patient can have many visits |
| Prescription | Visit ref, doctor ref, scanned image/PDF, upload timestamp, notes | Linked 1:1 or 1:many with a visit |
| Medicine / Inventory Item | Name, salt/composition, batch, expiry, stock quantity, unit price, hospital ref | Managed by medical store |
| Bill / Invoice | Visit ref, patient ref, line items (medicines/services), tax, discount, total, payment status | Generated by pharmacy/billing |
| Audit Log | User, action, entity affected, timestamp | For compliance and traceability |

---

## 7. Out of Scope (Current Phase)

- Doctors typing/structuring prescriptions directly into the system (prescriptions remain scanned handwritten documents in this phase).
- OCR-based extraction of medicine names from scanned prescriptions, and automated drug-interaction/allergy checks.
- Integration with external pharmacies, diagnostic labs, or insurance/TPA claim systems (confirmed: no insurance support; all patient payments via UPI or Cash only).
- Patient-facing mobile app or self-service portal.
- In-patient (IPD) workflows such as bed management, ward transfers, and OT scheduling — this phase focuses on out-patient (OPD) flow only.
- Telemedicine/video consultation.
- Multi-doctor / multi-department workflows within a single patient visit (e.g. same-day specialist referral) — Phase 1 supports one doctor per visit; this is a confirmed candidate for a later phase.

These may be considered as future phases based on business priority.

---

## 8. Confirmed Scope Decisions

| # | Topic | Confirmed Decision |
|---|---|---|
| 1 | Doctors per visit | One doctor per visit for Phase 1 (MVP). Multi-department / multi-doctor referral workflows within a single visit are deferred to a later phase. |
| 2 | Digital delivery of bill/prescription to patient | Confirmed in scope. Patients shall be able to receive their bill and/or prescription digitally (e.g. SMS/WhatsApp/email), subject to patient contact opt-in. |
| 3 | Regulatory/compliance scope | Standard Indian market compliance: DPDP Act 2023 for patient data handling and consent; reasonable security practices under the IT Act 2000; GST-compliant billing/invoicing. |
| 4 | Low-stock alerting | Confirmed in scope and Must Have. Alert when stock falls to/below a configurable threshold (default 30%), visible to both pharmacist and treating doctor. Threshold configurable per hospital by the Hospital Admin. |
| 5 | Subscription / licensing model | Flat subscription fee per hospital, priced for the Tier-2 Indian city hospital market. Managed by the Super Admin per tenant. |
| 6 | Payment methods / insurance | No insurance or TPA claim support. All patient payments via UPI or Cash only. |

*Remaining open item carried forward: whether inventory/stock management should support purchase orders and supplier tracking, or whether stock is initially maintained via simple manual stock-in entries — to be confirmed during the prioritization workshop, as it affects MVP scope for the medical store module.*

---

## 9. Next Steps

1. Prioritization workshop to confirm MVP (Must-Have) scope vs. later phases.
2. Preparation of the Technical Requirements Document (see companion document).
3. UI/UX wireframes for the four primary screens: Front Desk Registration, Doctor Consultation, Medical Store Dispensing, and Billing.
4. Data model and API design.
5. Project plan, milestones, and effort estimation.
