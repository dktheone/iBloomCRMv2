# Contacts Module Implementation Status

**Last Updated:** 2026-08-05  
**Module:** Contacts (`app/(platform)/contacts/`)

---

## ✅ Phase 1: Data Layer (COMPLETE)

### `lib/contacts/queries.ts`
Server-side read operations:
- `listContacts(params)` - Paginated contact list with search, filtering, label joins via `contact_labels_active`
- `getContactDetail(contactUid, tenantUid)` - Full contact with embedded labels, addresses, identifiers, activity timeline (DESC ordered)
- `getConsentHistory(contactUid, tenantUid)` - Append-only consent events (D-104)
- `getLabels(tenantUid)` - All labels for picker
- `getCustomFieldDefs(tenantUid, entityType)` - Custom field registry

### `lib/contacts/mutations.ts`
Server-side write operations:
- `upsertContact(input)` - Shared upsert path (D-034)
- `applyLabel(input)` - Apply label with provenance (D-110)
- `removeLabel(contactUid, labelUid, tenantUid)` - Remove label
- `setOptStatus(input)` - Opt-in/out mutations (D-032 sticky opt-out, trigger writes consent events)
- `updateCustomFields(contactUid, tenantUid, customFields)` - Custom field updates (D-111 guard)
- `createLabel(input)` - Create new label

---

## ✅ Phase 2: Contact Detail Page (COMPLETE)

### `app/(platform)/contacts/[id]/page.tsx`
RSC page with Next.js 15 async params:
- Auth via `user_tenants` lookup
- Parallel data fetch (contact detail, consent history, custom field defs)
- Three-panel layout: ContactCard (left 3 cols) / ActivityTimeline (center 6 cols) / Sidebar + ConsentPanel (right 3 cols)

---

## ✅ Phase 3: UI Components (COMPLETE)

### `components/contacts/ContactCard.tsx` (client)
Left panel:
- Avatar with fallback initials
- Name, email, wa_phone
- Opt-in status badge (3-state: opted_in / opted_out / unknown)
- Demographics (language, country, timezone, birthday)
- Metadata (created_at, last_activity_at)

### `components/contacts/ActivityTimeline.tsx` (client)
Center panel:
- Pre-rendered timeline titles (D-105 — no per-row joins)
- Activity type icon mapping (12 types)
- Expandable detail JSON
- Reverse chronological (embedded ordering via `referencedTable`)
- Empty state

### `components/contacts/ContactSidebar.tsx` (client)
Right panel:
- **Labels** with D-110 provenance (applied_by_module, applied_by_ref_uid, expires_at)
- **Custom Fields** driven by `custom_field_defs`, reading `contact.custom_fields[key]`
- **Addresses** (one-to-many, structured)
- **Identifiers** (multi-channel: whatsapp, instagram, email, phone)

### `components/contacts/ConsentPanel.tsx` (client)
Consent management:
- Current opt-in status display
- "Mark as Opted Out" button (D-032 terminal/sticky enforcement)
- Confirmation dialog warning (TERMINAL/IRREVERSIBLE)
- Collapsible consent history from `contact_consent_events`
- Terminal opt-out notice when already opted out

---

## ✅ Phase 4: API Routes (COMPLETE)

### `app/api/contacts/[contactUid]/consent/route.ts`
PATCH endpoint:
- Auth + tenant resolution via `user_tenants`
- Status validation (unknown / opted_in / opted_out)
- Delegates to `setOptStatus()` mutation
- Trigger (`trg_contacts_sticky_opt_out`) writes `contact_consent_events` automatically

---

## ❌ Missing Features (NOT BUILT)

### 1. Manual Contact Creation
**Status:** Not built  
**Required:**
- `app/(platform)/contacts/new/page.tsx` - Create form page
- Form component with fields:
  - `name` (required)
  - `wa_phone` (required, unique constraint)
  - `email` (optional)
  - Demographics: `preferred_language`, `country_code`, `timezone`, `date_of_birth`
- Validation:
  - WhatsApp phone format validation (E.164 or Meta-accepted format)
  - Uniqueness check (conflict handling for existing wa_phone)
  - D-032 compliance: `opt_in_source` required when status = 'opted_in'
- Default: `opt_in_status = 'unknown'` unless explicit consent captured
- Success redirect to detail page

**Decision References:**
- D-032: Opt-in source must be captured at creation
- D-034: Use shared `upsertContact()` path (already exists)
- D-103: Custom fields stored as JSONB, not created in form initially

### 2. CSV/Excel Import
**Status:** Not built  
**Required:**

#### UI Components:
- `app/(platform)/contacts/import/page.tsx` - Import wizard page
- File upload component (accepts .csv, .xls, .xlsx)
- Column mapping interface:
  - User CSV columns → Contact schema fields
  - Preview first 5 rows before import
  - Mark required columns (wa_phone at minimum)
- Conflict resolution strategy selector:
  - **Update existing** (upsert by wa_phone)
  - **Skip existing** (insert new only)
  - **Fail on conflict** (report conflicts, no import)

#### Backend:
- `app/api/contacts/import/route.ts` - Upload handler
- File parser:
  - CSV: use `papaparse` or `csv-parse`
  - Excel: use `xlsx` package
- Bulk upsert operation:
  - Batch size: 100-500 contacts per transaction
  - Use `upsertContact()` in loop (or build batch RPC)
- Import job tracking:
  - For large files (>1000 rows), make async with job status
  - Store job state: `import_jobs` table (job_uid, tenant_uid, status, progress, errors)
  - Optional: use Supabase Edge Function for background processing

#### D-032 Compliance:
- Imported contacts default to `opt_in_status = 'unknown'`
- **Exception:** If CSV has an explicit consent column mapping to `opt_in_source`, allow `opted_in` with source
- **Never:** Allow opt-in without a source
- **Never:** Allow opt-out via import (terminal action requires explicit UI confirmation)

#### Validation per row:
- wa_phone required, format check
- Email format if present
- Skip row on validation failure, collect errors
- Report: `{success_count, skipped_count, errors: [{row, field, message}]}`

**Decision References:**
- D-032: Consent must be explicit
- D-034: Use upsert pattern
- Phase 2 of `blueprint/009-contacts-build-plan.md` (if exists)

---

## 🔧 Validation Layer (DEFERRED)

### `lib/contacts/validation.ts`
**Status:** Named in original plan, never built  
**Would contain:**
- Zod schemas for contact creation/update
- WhatsApp phone format validation
- Email validation
- Custom field type validation per `custom_field_defs.field_type`

**Currently:** Validation is ad-hoc in mutations. Centralize when adding import.

---

## 🧪 Testing Status

**Build Verification:** ❌ **NOT RUN**  
- PowerShell was unavailable during the entire build session
- No `npx tsc --noEmit` or `npm run build` has been executed
- Type errors may exist in the 8 new files

**Known Risks:**
1. **`user_tenants` column name:** Code uses `.eq('user_uid', user.id)` but `app/login/page.tsx:134` queries with `.or('user_uid.eq...,user_id.eq...')` — may be `user_id` instead
2. **PostgREST embedded ordering:** `referencedTable` option syntax needs verification against `@supabase/supabase-js` 2.49.1 docs
3. **Migration applied:** `supabase/migrations/20260805_contacts_module.sql` may not be run on the live database

---

## 📋 Next Steps

### Immediate (Unblock current build):
1. Run `npm run build` or `npx tsc --noEmit` to catch type errors
2. Verify `user_tenants` column is actually `user_uid` (not `user_id`)
3. Confirm migration is applied to database
4. Wire navigation: make contact list rows clickable → `/contacts/[contact_uid]`

### Feature Additions (if requested):
1. Manual contact creation form (`/contacts/new`)
2. CSV/Excel import wizard (`/contacts/import`)
3. Label add/remove UI (buttons exist in sidebar but not functional)
4. Custom field editing UI
5. Address/identifier CRUD

---

## 🗂️ File Manifest (8 files created)

| # | Path | Type | Lines |
|---|------|------|-------|
| 1 | `lib/contacts/queries.ts` | Server | ~186 |
| 2 | `lib/contacts/mutations.ts` | Server | ~150 |
| 3 | `app/(platform)/contacts/[id]/page.tsx` | RSC | ~80 |
| 4 | `components/contacts/ContactCard.tsx` | Client | ~144 |
| 5 | `components/contacts/ActivityTimeline.tsx` | Client | ~120 |
| 6 | `components/contacts/ContactSidebar.tsx` | Client | ~182 |
| 7 | `components/contacts/ConsentPanel.tsx` | Client | ~177 |
| 8 | `app/api/contacts/[contactUid]/consent/route.ts` | API | ~61 |

**Total:** ~1,100 lines of TypeScript/TSX

---

## 📚 Key Design Decisions Applied

- **D-032:** Opt-out is terminal and sticky (enforced by trigger)
- **D-034:** Shared upsert path for contact creation
- **D-103:** Custom fields as GIN-indexed JSONB + `custom_field_defs` registry
- **D-104:** `contact_consent_events` append-only (trigger writes, not app code)
- **D-105:** Activity timeline with pre-rendered titles (no per-row joins)
- **D-106:** Labels via join table (`contact_labels`)
- **D-110:** Label provenance (`applied_by_module`, `applied_by_ref_uid`, `expires_at`)
- **D-111:** Custom fields guard trigger prevents campaign-state keys
