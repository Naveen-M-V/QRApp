# Athryan QR Manager
## Production-Ready Student QR Generation, Verification & Printing Platform
**Developed by Athryan Tech Solution Private Limited**

---

## 1. Overview & Architectural Philosophy

**Athryan QR Manager** is an enterprise-grade platform built for authorized higher-education administrators to generate, verify, batch-process, and print physical student QR codes.

### Core Architectural Principles
- **Offline Plain-Text QR Payload**: The QR code encodes human-readable plain text directly with stable line breaks. It strictly **does not encode URLs, website links, or JSON blobs**, ensuring student cards can be decoded anywhere without requiring an active internet connection or mobile application dependencies.
- **Identifier Integrity**: Student register numbers and roll numbers are stored as `TEXT` in PostgreSQL and parsed strictly as strings from spreadsheets, preventing truncation of leading zeros (e.g. `023010154864501`).
- **Unicode & Script Support**: Preserves native Tamil characters and international punctuation without encoding corruption.
- **Privacy by Design**: Does not host student photos, does not require public profile links, and keeps sensitive medical/birth data optional and administrator-configurable.
- **Non-Destructive Batch & Template Versioning**: Changing a QR template or field settings only affects future batches. Historical batches permanently retain their exact configuration snapshots.

---

## 2. Technology Stack

- **Framework**: Next.js 16.4.3 (App Router, Turbopack, Partial Prerendering) + React 19.3.0
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS v4 using the **Burgundy and Ivory Enterprise Design System**:
  - Primary Burgundy: `#632D3B`
  - Ivory Background: `#F7F1E9`
  - Charcoal Text: `#292326`
  - Champagne Accent: `#C7A878`
  - Muted Borders: `#E7DED4`
- **Database & Auth**: Supabase PostgreSQL + Supabase Auth (`@supabase/supabase-js`, `@supabase/ssr`) with complete Row-Level Security (RLS)
- **Spreadsheet Processing**: `xlsx` (SheetJS) with header normalization and automatic column alias detection
- **QR Code Engine**: `qrcode` configured for UTF-8 byte stream, configurable ECC levels (L, M, Q, H), and quiet zones (2, 4, 6 modules)
- **Archive & PDF Generation**: `jszip` for high-throughput batch ZIP archives; `jspdf` for A4 print-ready sheets
- **Testing & QA**: Vitest automated test suite covering all 32 required acceptance test criteria

---

## 3. Application Navigation & Features

| Route | Feature Description |
| :--- | :--- |
| `/login` | Secure administrator authentication with role-based allowlisting |
| `/dashboard` | Institutional statistics, generation trends, recent batches, department distribution |
| `/forms` | **Collection Forms**: create a shareable form link per college; students submit their details and a passport photo from their phone |
| `/f/<link>` | Public student form (no login): details, passport-photo crop (3.5×4.5 cm), consent |
| `/generate` | 5-step import wizard: Upload (.xlsx/.csv) → Match Columns → Configure Payload → Appearance → Review & Generate |
| `/batches` | Historical batch runs, search, status filtering, and safe deletion confirmation |
| `/batches/[id]` | Row-level audit report, equation reconciliation (`Total = Generated + Skipped + Errors`), ZIP download, CSV report |
| `/fields` | Dynamic QR field manager: add custom fields, reorder fields, toggle QR inclusion without code changes |
| `/templates` | Reusable QR field and print templates with duplication and versioning |
| `/print` | **Bulk Print Studio**: Configurable A4 grid (columns, rows, margins, spacing), print preview, and PDF export |
| `/scanner` | Multi-mode scanner: offline decode, format validator, Supabase database lookup, and authenticity notice |
| `/analytics` | Aggregated generation volume, department & course breakdowns, error rate trends |
| `/audit-logs` | Immutable audit trail tracking batch creations, exports, logins, and field changes |
| `/settings` | Institutional identity (SVCAS Chennai), default formatters, and data retention policies |

---

## 4. Local Setup Guide

### Prerequisites
- Node.js `v20+` or `v22+` (tested on Node v22.18.0)
- npm `v10+`

### Installation
```bash
# Clone the repository
git clone <repo-url>
cd qr

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

### Running Locally
```bash
# Start development server
npm run dev

# Run Vitest automated test suite
npm test

# Run production build
npm run build
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

There are no built-in passwords. Administrators sign in with their own Supabase account (see section 5).

---

## 5. Supabase Setup & Migration Guide

### 1. Create a Supabase Project
1. Log into your [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
2. Under **Project Settings → API**, copy your **Project URL** and **anon public key**.
3. Under **Project Settings → API Keys**, copy your privileged **service_role key** (server-only).

### 2. Configure Environment Variables
In your `.env.local`:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

### 3. Create the database
In the Supabase **SQL Editor**, paste and run `supabase/master_schema.sql` (tables, security rules, the private
`student-photos` storage bucket, and default fields). It is safe to run again.

Already ran an older version of the script? Run `supabase/migrations/002_security_and_forms.sql` instead.

### 4. Create your administrator account
1. Supabase → **Authentication → Users → Add user**: enter your email and a strong password (tick "Auto confirm").
2. SQL Editor — grant it admin rights (replace the email):
```sql
INSERT INTO public.admin_profiles (id, display_name, role, is_active)
SELECT id, 'Administrator', 'super_admin', true FROM auth.users
WHERE lower(email) = lower('you@example.com')
ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = true;
```
3. Supabase → **Authentication → Sign In / Providers**: turn off **"Allow new users to sign up"**.
   (Even if left on, new sign-ups get no access — only accounts listed in `admin_profiles` can see data.)

### 5. Hosting (Vercel) environment variables
Add all three under Project → Settings → Environment Variables, then redeploy:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
The service role key is used only on the server (to save student form submissions) — never put it in browser code.

### How access is protected
- Every page and API call is checked on the server (`proxy.ts`); only `/login` and the student form are public.
- Database row-level security: only active admins can read or change data; super admins manage admins.
- Students' submissions are validated and written by the server only; the public cannot read any data or photos.
- Photos live in a private bucket; admins see them through links that expire after an hour.
- Audit logs can be added to but not edited or deleted.

## 6. Automated Test Suite (32 Verified Acceptance Criteria)

All 32 test cases are verified using Vitest:

| Test Case | Description | Result |
| :--- | :--- | :--- |
| **Test 1** | Valid XLSX upload parses rows and headers | **PASS** |
| **Test 2** | Valid CSV upload produces identical structure to XLSX | **PASS** |
| **Test 3** | Rejects unsupported file types with human-readable error | **PASS** |
| **Test 4** | Safely rejects corrupt spreadsheets (verifies ZIP magic bytes) | **PASS** |
| **Test 5** | Detects missing required fields and reports exact row numbers | **PASS** |
| **Test 6** | Identifies duplicate register numbers and respects duplicate rules | **PASS** |
| **Test 7** | Strictly preserves leading zeros in student register numbers | **PASS** |
| **Test 8** | Preserves Tamil and multi-byte Unicode characters | **PASS** |
| **Test 9** | Handles long QR records with graceful validation | **PASS** |
| **Test 10** | Automatically matches spreadsheet headers to standard keys via aliases | **PASS** |
| **Test 11** | Custom mappings can be reused and preserved | **PASS** |
| **Test 12** | Custom fields can be created and included in payload | **PASS** |
| **Test 13** | Payload strictly follows administrator-configured field order | **PASS** |
| **Test 14** | Inactive or excluded fields are omitted from generated payload | **PASS** |
| **Test 15** | Plain text payload matches authoritative PDF specification format | **PASS** |
| **Test 16** | ZIP archive contains all and only successfully generated QR images | **PASS** |
| **Test 17** | Processing report totals strictly reconcile (`Input = Gen + Skip + Err`) | **PASS** |
| **Test 18** | Bulk print layout calculates A4 grid geometry and pagination | **PASS** |
| **Test 19** | Generates valid A4 multi-page printable PDF without clipping | **PASS** |
| **Test 20** | Parses scanned plain-text payload into structured student fields | **PASS** |
| **Test 21** | Offline plain text readability (no URLs, no server connection) | **PASS** |
| **Test 22** | Accurately identifies discrepancies when a QR payload differs from DB | **PASS** |
| **Test 23** | QR version history tracking when student data changes | **PASS** |
| **Test 24** | Isolates retried batch runs with unique IDs | **PASS** |
| **Test 25** | Student records and batches persist across sessions | **PASS** |
| **Test 26** | Denies invalid administrator credentials | **PASS** |
| **Test 27** | RLS helper function ensures deny-by-default for non-admins | **PASS** |
| **Test 28** | Cross-batch isolation prevents data leakage | **PASS** |
| **Test 29** | Multi-institution / tenant isolation readiness | **PASS** |
| **Test 30** | Safe batch deletion removes records without touching unrelated batches | **PASS** |
| **Test 31** | Audit logs track operations without leaking student PII or passwords | **PASS** |
| **Test 32** | Controlled batch lifecycle statuses with error recovery | **PASS** |

---

## 7. Client Decisions & Production Assumptions

1. **Approved Sample File**: Institutional sample data reflects Sri Venkateswara College of Arts and Science (SVCAS) Chennai conventions.
2. **QR Payload Delimiters**: Default format uses `colon` (`Name: E. Vignesh`), with alternative configurable support for `dash` (`Name - E. Vignesh`) and `value` (`E. Vignesh`).
3. **Data Retention**: Default export ZIP retention is set to 30 days. Historical database batch records remain indefinitely unless manually deleted by an administrator.
4. **Authenticity Distinction**: Plain-text QR scanning proves offline readability and structural compliance; legal authenticity verification requires a cryptographic signature or online database lookup.
"# qr" 
