# Plan — Contacts Toolbar + Staged Import with Labelling

**Date:** 2026-08-05
**Revision:** 2 — adds your form-quality, country/timezone, label-modal, and filtering requirements
**Status:** PROPOSAL — awaiting your review, no code written yet
**Scope:** `app/(platform)/contacts/`, `app/api/contacts/`, `components/contacts/`, `components/ui/`, two new migrations

> **Revision 2 changes:** new requirements **R5–R9** in §2 · new **Phase 0** (contact-form rework) in §5 · Phase 1 gains label filtering and an edit modal · new decisions **D4–D7** in §4 · new **§10 migration policy** (never edit an applied migration).

---

## 0. Standing rule recorded this revision

**SQL migrations are append-only.** Every schema change gets its own new dated
file in `supabase/migrations/`. No existing migration is ever edited, amended, or
"corrected" — including files written earlier in the same session — because they
have already been executed against the live database and modifying one destroys
the record of what the database actually ran. Corrections roll *forward* in a new
file. This is now in my project memory and applies to every future plan and build,
not just this one. See §10.

---

## 1. Gap analysis — what is actually wrong today

I read `app/(platform)/contacts/page.tsx` before writing this. Confirmed problems:

| # | Problem | Evidence |
|---|---|---|
| G1 | No route to `/contacts/new` or `/contacts/import` from anywhere in the UI | The action bar at `page.tsx:75-86` contains only a search input. No buttons. |
| G2 | Table rows are not clickable — the detail page I built is unreachable | `page.tsx:117` `<tr>` has a hover style but no `onClick` and no `<Link>` |
| G3 | Empty state actively misleads | `page.tsx:99-101` says contacts "are automatically created when test broadcasts or WhatsApp messages are sent" — it does not mention that manual creation and import now exist |
| G4 | No analytics anywhere | Only a raw total count chip at `page.tsx:69`. No consent breakdown, which is the number that actually governs who can be messaged. |
| G5 | Client-side filtering only | `page.tsx:44` filters an unpaginated `select('*')`. Fine at 50 contacts, breaks at 5,000. Out of scope for this plan but worth recording. |
| G6 | Import commits straight to `contacts` | No review step, no labelling, and the file is uploaded twice (once for preview, again for commit). |
| G7 | No sample files to download | Users have to guess the column headers. |
| G8 | **`ContactForm.tsx` does not match the house form style** | It uses raw `<input>` + `<label>` markup. The rest of the app uses `components/ui/FormField.tsx` — icon inside the box, red box fill + red border + `AlertCircle` on error, `↳ message` subtext below. The contact form has none of that. |
| G9 | **`ContactForm.tsx` does no client-side validation at all** | `lib/contacts/validation.ts` exists and is used server-side, but the form posts blind and only shows whatever the API returns. `app/setup/page.tsx:95-117` is the established pattern: `schema.safeParse()` → map `issue.path[0]` → `fieldErrors` → pass into `FormField error=`. |
| G10 | Country and timezone are free-text | Anything can be typed. `countryCode` is validated as "2 letters" but not as a real country; timezone is an unconstrained string. |
| G11 | Labels cannot be set anywhere in the UI | The `labels` and `contact_labels` tables exist (`20260805_contacts_module.sql:170,183`) and `mutations.ts` has `addLabel`/`removeLabel`, but no page or component calls them. |
| G12 | No filtering by anything except the name/phone text box | `page.tsx:44` does one client-side `.filter()` on a text query. No label, consent, country, or date filter. |
| G13 | Editing a contact requires a full page navigation | Only reachable via the detail page, which itself is unreachable (G2). |

---

## 2. Requirement analysis

Your nine requirements (four from the first pass, five added this revision):

**R1 — Toolbar with actions + analysis.**
One horizontal bar on `/contacts` holding: search, primary actions (New Contact, Import), secondary actions (Export, Refresh), and a compact analytics strip. Implies G1 and G4 are fixed together.

**R2 — Sample CSV and XLSX downloads.**
Two files, offered in the import upload step. CSV can be generated on the fly with zero dependencies. **XLSX cannot** — writing a real `.xlsx` requires the `xlsx` package, which is not installed (I checked `node_modules`). See Decision D2 below.

**R3 — See imported contacts before the final write.**
This is the significant one. It means the current one-shot import must become a **staged** import: parse → review the parsed rows → act on them → *then* write to `contacts`.

**R4 — Label them before final import.**
Labels are chosen once and applied to the whole batch (with per-row exclusion). Label writes need D-110 provenance: `applied_by_module = 'csv_import'` and `applied_by_ref_uid = <the import batch uid>`, so every label can be traced back to the file that caused it.

**R5 — Contact form must match the house style and validation pattern (new).**
`app/setup/page.tsx:361-407` is the reference:
- Use `components/ui/FormField.tsx` (icon inside the box, red fill + red border + `AlertCircle` icon on error, `↳ error` subtext below)
- Use `lib/validations/schemas.ts` pattern: define a Zod schema, call `.safeParse()` on submit, map `issue.path[0]` to field names, pass error strings into `<FormField error={fieldErrors.field} />`
- `PhoneInput.tsx` already exists and matches this pattern (India/US flags, red error state, same subtext). Reuse it.

**R6 — Country select: India, Nepal, USA only; flags; India default (new).**
Not a free-text input. Three-option select (or a custom dropdown like `PhoneInput`), with country flags if feasible. Nepal is new — `PhoneInput.tsx` currently only has India and USA SVG flags; I'll need to add Nepal's flag SVG.

**R7 — Timezone fixed to IST (new).**
Not user-editable. Either hidden or shown as a read-only chip. India Standard Time is `Asia/Kolkata` in IANA tz database format (that's what Supabase `timestamptz` tooling and JS `Intl` expect).

**R8 — Source and label assignment (new).**
- **Source:** when creating manually, set `contact_source_events.source_type = 'manual'` (already a D-110 provenance column). Simple.
- **Labels:** you want the ability to attach labels at creation time. Two UX paths:
  - **Path A** — label picker embedded in the contact form (multi-select dropdown at the bottom).
  - **Path B** — "Add Labels" button in the form that opens a modal, so the form stays compact. You prefer modals over navigation.
  
  I lean toward **Path B** because the form is already 8+ fields and a label multi-select with live fetch + search would crowd it. A modal keeps the happy path fast (most contacts don't get labeled at creation) and lets us reuse the same `<LabelPickerModal>` component in the edit flow and the import review step.

**R9 — Filtering and inline editing on the list page (new).**
- **Filtering:** by labels, opt-in status, country, date range (created_at). The current search box only does text matching on name/phone. Real filtering needs query params + server-side WHERE clauses + UI filter chips.
- **Inline editing:** clicking a row (or an "Edit" icon-button in the row) opens `<ContactEditModal>` — same `ContactForm` component in `mode="edit"`, rendered as a modal overlay instead of a full page. On save, the modal POSTs to `/api/contacts`, closes, and the list re-fetches.

---

## 3. The one real architectural decision

R3 + R4 need the parsed rows to survive between "review" and "commit". Two ways:

### Option A — Client-side staging (no migration)
Parsed rows are held in React state in the wizard. Review, exclusion, and label picking all happen in memory. One `POST` at the end sends rows + label choices together.

- Nothing new in the database
- Fastest to build (~1 day)
- Rows are lost on refresh or tab close
- 5,000 rows of JSON in browser memory and in one request body — workable but heavy
- No audit trail of *what was uploaded*, only of what was written

### Option B — Database staging (one migration) ← **recommended**
A new `import_batches` + `import_batch_rows` pair. Upload parses and writes rows to staging with their validation verdict. Review reads from staging with real pagination. Commit promotes staged rows into `contacts`, then stamps the batch as committed.

- Survives refresh; the batch can be resumed or abandoned
- Review paginates, so row count stops being a memory problem
- Gives a real audit trail: the raw uploaded row is retained next to the contact it became
- **The schema already expects this.** `supabase/migrations/20260805_contacts_module.sql:384` defines `contact_source_events.import_job_uid` as a bare uuid with the comment *"no FK — import_jobs unbuilt (D-034, Import module)"*. Option B is the table that comment is waiting for, and it lets us add the FK properly.
- Costs one migration and ~1 extra day

**Recommendation: Option B.** G6 and that dangling `import_job_uid` are the same unfinished thought, and doing it client-side leaves it dangling permanently. If you want the UI sooner, I can build the toolbar (Phase 1) first and land staging after — they are independent.

---

## 4. Decisions you need to make

**D1 — Staging mode: A (client) or B (database)?**
See section 3. My recommendation is **B (database)** for audit trail + refresh survival + pagination at scale, but A is faster if you want something working today.

**D2 — Sample XLSX: fake it or gate it?**
The `xlsx` package is not installed. Two paths:

- **D2a — Gate XLSX sample cleanly:** "Sample CSV" button works. "Sample XLSX" button shows a modal: *"Excel sample requires the `xlsx` package. Run `npm install xlsx`, or use the CSV sample."* No fake extension-swap, no silent breakage.
- **D2b — Install `xlsx` now and deliver both samples working.** I add it to `package.json`, you run `npm install`, both buttons work.

My recommendation: **D2b**. XLSX import already works (with a clean gate when the package is absent). Finishing the sample path costs one `npm install` and keeps the UX symmetric.

**D3 — Analytics chips: which metrics?**
R1 asks for "analysis" in the toolbar. The only number shown today is total count. I propose a 4-chip strip:

| Chip | What it shows | Why it matters |
|---|---|---|
| Total | All contacts | Baseline |
| Opted In | `opt_in_status = 'opted_in'` | Messageable audience size (the number that actually governs broadcast reach) |
| Opted Out | `opt_in_status = 'opted_out'` | Suppression list size (terminal, can never be messaged) |
| Unknown | `opt_in_status = 'unknown'` | Contacts awaiting consent capture |

Or, if you'd rather see labels/sources/activity:

| Alt | Shows |
|---|---|
| By Source | Top 3 `opt_in_source` values with counts |
| Labeled | Contacts with ≥1 active label |
| Recent | Contacts created in the last 7 days |

**Which set?** I lean toward the consent-status breakdown (the first table) because it directly tells you who can be messaged, which is what D-032 and the whole consent model are built around.

**D4 — Country select: extract a shared component, or inline it?** *(new)*

R6 needs a three-country select with flags. `components/ui/PhoneInput.tsx:14-60` already hand-writes `IndiaFlagSvg` and `UsFlagSvg` as inline SVG, with this comment on top:

> *"High-Definition SVG Flag Components to guarantee 100% crisp rendering across Windows, Mac, and Linux"*

That comment is a deliberate rejection of emoji flags (🇮🇳 🇳🇵 🇺🇸), which **do not render at all on Windows** — the OS ships no regional-indicator glyphs, so they fall back to two grey letter boxes. So R6's "if possible attach the country flag" is possible, but it means **hand-authoring a third SVG for Nepal** (which is the awkward one — it's the only non-rectangular national flag in the world, a double pennant). I'll do it; it's ~10 lines of path data.

- **D4a — Extract `components/ui/CountrySelect.tsx`.** Owns the three-country list, the three flag SVGs, and a popover dropdown copied from `PhoneInput.tsx:150-230` (which already has the `useRef` + `mousedown` click-outside handling). Reusable by the import mapping step and any future address form.
- **D4b — Inline it in `ContactForm.tsx`.** One fewer file, but the SVG + popover code gets duplicated the moment anything else needs a country.

My recommendation: **D4a**. `PhoneInput` and `CountrySelect` should also share one source of truth for the country list, so I'd move the flag SVGs into `components/ui/flags.tsx` and have both import from there. That is a small refactor of `PhoneInput.tsx` — flagging it because it touches a working file.

**Order in the dropdown (per R6):** India (default, pre-selected) → Nepal → United States. Stored value is the ISO-3166 alpha-2 code the schema already expects (`contacts.country_code CHAR(2)`): `IN`, `NP`, `US`.

**D5 — Timezone: hard constant, or visible-but-locked?** *(new)*

R7 says timezone is "default and fixed for IST". IST is `Asia/Kolkata` in IANA form, which is what Postgres and JS `Intl` both want. Three ways to honour "fixed":

- **D5a — Constant, no UI.** The form never shows a timezone field; `lib/contacts/constants.ts` exports `DEFAULT_TIMEZONE = 'Asia/Kolkata'` and both the form and the import path apply it. Cleanest form, but a user who wonders "what timezone is this contact in?" has no answer on screen.
- **D5b — Read-only chip.** A small disabled pill in the form reading `🕐 IST (Asia/Kolkata)` with helper text *"Fixed for all contacts"*. Same behaviour as D5a, but the value is visible and self-documenting.
- **D5c — Disabled `<select>` pre-set to IST.** Identical to D5b visually, but becomes editable later by removing one `disabled` prop.

My recommendation: **D5b**. It satisfies "fixed" literally while still telling the user what the stored value is — which matters later, because timezone drives send-window scheduling and a silently-assumed value is the kind of thing that surprises someone at 2 a.m. Note this contradicts nothing: the import path already accepts a `timezone` column, and I'd leave that alone (imported files may legitimately carry other zones) — R7 governs the *manual* form.

**D6 — How are labels attached? (you invited a counter-proposal)** *(new)*

R8 asks whether attaching a label from the contact form is feasible, and explicitly asks for a better idea if I have one, with a stated preference for **pop-up modals over navigating to a new page**. Here is my answer, grounded in what the schema already says.

**The key fact:** labels are *not* a per-contact text field. `20260805_contacts_module.sql:168-181` defines `labels` as a **tenant-wide taxonomy** — `UNIQUE (tenant_uid, name)`, with a `color`, its own uid, and its own lifecycle. `contact_labels` (line 183) is the join, and it carries D-110 provenance: `applied_by_uid`, `applied_by_module`, `applied_by_ref_uid`, `expires_at`. So "type a label into the contact form" is the wrong shape — it would either create duplicate near-identical labels (`VIP`, `vip`, `V.I.P.`) or silently fail the unique constraint.

**My proposal — one `<LabelPicker>` component, three placements, zero new pages:**

| Placement | What it does |
|---|---|
| Contact form (R8) | A chip row + "＋ Label" button. Clicking opens the picker modal. Selected labels are held in form state and written *after* the contact insert succeeds, with `applied_by_module = 'manual'`. |
| Import review step (R4) | Same modal, opened from "Apply labels to N contacts". Writes with `applied_by_module = 'csv_import'`, `applied_by_ref_uid = <batch_uid>`. |
| List page filter (R9) | Same label list, rendered as a filter dropdown instead of a picker. |

**Inside the modal:** a searchable checkbox list of the tenant's existing labels (each with its colour dot), and at the bottom an inline **"＋ Create new label"** row — name input + a small colour swatch picker — that `POST`s to `/api/contacts/labels` and immediately appears checked in the list. No navigation, no separate label-management page needed to get started. (A full label admin page — rename, recolour, merge, delete — is worth building later, but it is not a blocker for R8.)

**Why this over a plain text input in the form:** it enforces the tenant taxonomy, it makes the same component pay for itself three times, and it keeps the form compact, which is exactly what R5 asks for.

**Recommendation: build `components/contacts/LabelPicker.tsx` + `LabelCreateModal` inline within it.** Two new API routes: `GET/POST /api/contacts/labels` (list + create) and `POST /api/contacts/[id]/labels` (attach/detach for one contact).

**D7 — Which fields does the list-page filter cover?** *(new)*

R9 says "filtered by labels and other possible fields". The genuinely useful filters, given what's in the schema:

| Filter | Column | Why it earns its place |
|---|---|---|
| **Label** | `contact_labels.label_uid` | Explicitly requested. Multi-select, OR semantics ("has any of these"). |
| **Consent status** | `contacts.opt_in_status` | The one field that decides whether a contact can legally be messaged. |
| **Country** | `contacts.country_code` | Same three options as the form's `CountrySelect`. |
| **Source** | `contacts.opt_in_source` | Answers "where did these contacts come from" — the natural follow-up to an import. |
| **Created date** | `contacts.created_at` | Presets (today / 7d / 30d / custom) rather than a raw date picker. |
| *(text search)* | name / phone / email | Already exists at `page.tsx:44`; stays. |

I'd **skip** `preferred_language`, `date_of_birth`, and custom-field filtering in this pass — jsonb custom-field filtering (D-103) needs a GIN index and its own design conversation, and it isn't what R9 is asking for.

**One consequence worth calling out:** filtering by label requires a join, and G5 already notes the page does an unpaginated `select('*')` then filters in the browser. Adding four more client-side filters on top of that makes G5 worse. So **Phase 4 moves filtering server-side** — query params → a Supabase query with `.in()` / `.gte()` / an inner join on `contact_labels` → paginated results. That's more work than a client-side filter, but doing it client-side now means rewriting it at the first tenant with 2,000 contacts.

---

## 5. What I will build (assuming B + D2b + consent chips + D4a + D5b + D6 + D7)

### Phase 0 — Contact form rework (fixes G8, G9, G10; delivers R5, R6, R7, R8)

This is new in Revision 2 and I'd do it **first**, because the same `ContactForm` component gets reused by the edit modal in Phase 5 — reworking it once, up front, means the modal inherits the fix instead of needing a second pass.

**0.1 — Adopt the house form component (R5).**

`components/contacts/ContactForm.tsx` currently uses raw `<input>` + `<label>` markup. Replace every field with `components/ui/FormField.tsx`, which already implements exactly what R5 describes:

| R5 asks for | `FormField` already does it at |
|---|---|
| Icon in a compact layout | icon rendered absolutely inside the box, left-padded input |
| Validation highlights the input box | `FormField.tsx` error branch: `bg-rose-50/60 · border-rose-500 · focus:ring-rose-500/15` — the box itself fills red, not just the message |
| Subtext under the field | `↳ {error}` in `text-[11px] font-mono` on error, or `helperText` in `text-[10px]` otherwise |

The phone field uses `components/ui/PhoneInput.tsx` instead — it is already the house component for E.164 entry and already renders the same error styling.

Layout follows `app/setup/page.tsx:360`: `grid grid-cols-1 md:grid-cols-2 gap-5`.

**0.2 — Add `contactFormSchema` to `lib/validations/schemas.ts` (R5).**

Not a new file — that module is already the home of `setupWizardSchema`, `enrollPhoneSchema`, `saveTemplateSchema`, and the shared `e164PhoneRegex`. Same Zod 4 house style (`z.string({ message: '…' })`, not `required_error`):

```ts
export const contactFormSchema = z.object({
  waPhone: z.string({ message: 'WhatsApp number is required' })
    .regex(e164PhoneRegex, 'Enter a valid number with country code, e.g. +919876543210'),
  name: z.string().trim().max(120, 'Name cannot exceed 120 characters').optional(),
  email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
  countryCode: z.enum(['IN', 'NP', 'US'], { message: 'Select a country' }),
  preferredLanguage: z.string().trim().max(10).optional(),
  dateOfBirth: z.string().optional(),
  notes: z.string().trim().max(2000, 'Notes cannot exceed 2000 characters').optional(),
});
```

Wired into the form with the identical `safeParse` → `fieldErrors` loop from `app/setup/page.tsx:95-117`, so validation behaves the same way in both places:

```ts
const result = contactFormSchema.safeParse(values);
if (!result.success) {
  const errors: Record<string, string> = {};
  result.error.issues.forEach((i) => { errors[i.path[0] as string] = i.message; });
  setFieldErrors(errors);
  toast.error('Validation Error', { description: 'Please fix the errors before saving.' });
  return;
}
```

Server-side validation in `lib/contacts/validation.ts` stays exactly as it is — the client schema is a UX layer, not a replacement. The API keeps rejecting bad input regardless of what the browser sent.

**0.3 — `components/ui/CountrySelect.tsx` (R6, per D4a).**

- Three options in this order: **India (default) · Nepal · United States**
- Each with a hand-written inline SVG flag, matching `PhoneInput.tsx`'s stated reason for not using emoji (they render as grey letter boxes on Windows)
- **New work:** `NepalFlagSvg` — the double-pennant shape, crimson with a blue border, sun and moon. ~15 lines of path data
- **Small refactor:** move `IndiaFlagSvg` / `UsFlagSvg` out of `PhoneInput.tsx` into `components/ui/flags.tsx` so both components share one definition. `PhoneInput.tsx` then imports them; its behaviour does not change
- Dropdown mechanics (button → popover → click-outside via `useRef` + `mousedown`) copied from `PhoneInput.tsx:150-230`
- Renders inside a `FormField`-shaped shell so it lines up with the other fields and can show the same red error state

**0.4 — Timezone locked to IST (R7, per D5b).**

`lib/contacts/constants.ts` gains:

```ts
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';   // IST — fixed for manually-created contacts (R7)
export const DEFAULT_COUNTRY = 'IN';
```

The form shows a **disabled** field reading `IST (Asia/Kolkata)` with helper text *"Fixed for all contacts"*, and always submits `DEFAULT_TIMEZONE`. It is not in `contactFormSchema` because there is nothing to validate.

**0.5 — Source = `manual` (R8, first half).**

The create handler already records provenance; this just pins the value. On manual creation the API writes `contact_source_events.source_type = 'manual'` with `created_by_uid` = the acting user. No schema change — that column exists.

**0.6 — `components/contacts/LabelPicker.tsx` (R8, second half, per D6).**

- A chip row in the form showing currently-selected labels (colour dot + name + ✕ to remove), plus a **"＋ Label"** button
- The button opens `<LabelPickerModal>`: search box, checkbox list of the tenant's labels, and an inline **"＋ Create new label"** row (name input + colour swatches → `POST /api/contacts/labels`)
- On the **create** form, selections are held in state and written *after* the contact insert returns a `contact_uid`, with `applied_by_module = 'manual'`
- On the **edit** modal (Phase 5), the same component writes through immediately

**New API routes:**
- `GET /api/contacts/labels` → the tenant's labels
- `POST /api/contacts/labels` → create one (`{ name, color }`), respecting `UNIQUE (tenant_uid, name)` with a friendly "that label already exists" error
- `POST /api/contacts/[id]/labels` → `{ add: uuid[], remove: uuid[] }`, stamping D-110 provenance

**No migration needed for labels.** `labels` and `contact_labels` already exist in `20260805_contacts_module.sql:168-207`, `lib/contacts/mutations.ts` already has `addLabel`/`removeLabel`, and RLS policies are already in place. Only the UI and the routes are missing (G11).

**Estimated lines:** ~650 (form rewrite ~250, `CountrySelect` + `flags.tsx` ~180, `LabelPicker` + modal ~150, 3 API routes ~120, schema ~30).

---

### Phase 1 — Contacts page toolbar (fixes G1, G2, G3, G4)

**File:** `app/(platform)/contacts/page.tsx`

**Changes:**

1. **Replace the action bar** (currently lines 75–86, search-only) with a new `ContactsToolbar` component:
   - **Left:** Search input (keep existing)
   - **Center:** 4 consent-status chips (Total / Opted In / Opted Out / Unknown) with live counts from a `group by opt_in_status` query
   - **Right:** Two primary action buttons:
     - "New Contact" → `/contacts/new` (cyan solid button)
     - "Import" → `/contacts/import` (cyan outline button)
   - **Secondary actions** (icon-only, right edge): Export CSV, Refresh

2. **Make table rows clickable:** Wrap each `<tr>` in a Next.js `<Link href={`/contacts/${c.contact_uid}`}>` so the detail pages I already built are reachable.

3. **Fix the empty state** (line 99–101): Change the misleading text to:
   > *"No contacts yet. Create one manually, import a file, or send your first WhatsApp message to auto-create a contact."*

**New component:** `components/contacts/ContactsToolbar.tsx` (client component, fetches counts on mount, holds search + actions + chips in a flex row).

**API addition:** `GET /api/contacts/stats` → returns `{ total, opted_in, opted_out, unknown }` from one `group by` query.

**Estimated lines:** ~200 (toolbar component + stats API route + page.tsx edits).

---

### Phase 2 — Sample file downloads (fixes G7)

**New API route:** `app/api/contacts/sample/route.ts`

- `GET ?format=csv` → returns an RFC 4180 CSV with headers matching `IMPORT_TARGET_FIELDS` and 3 example rows (one opted-in with source, one unknown, one with all demographics filled)
- `GET ?format=xlsx` → uses the `xlsx` package (after you `npm install xlsx`) to generate a real `.xlsx` with the same content

**UI change:** In `ImportWizard.tsx`, the upload step gains two download links above the file picker:
- **Download sample CSV** (icon: file-text)
- **Download sample XLSX** (icon: file-spreadsheet)

Both hit `/api/contacts/sample?format=<csv|xlsx>` and trigger a browser download with `Content-Disposition: attachment`.

**Example row content:**

| wa_phone | name | email | opt_in_source | country_code | notes |
|---|---|---|---|---|---|
| +919876543210 | Rahul Sharma | rahul@example.com | website_signup | IN | Signed up on 2026-08-01 |
| +14155552671 | Jane Doe | jane@example.com | | US | Imported from legacy CRM |
| +447700900123 | Emma Wilson | | web_form_checkbox | GB | Subscribed to newsletter |

**Estimated lines:** ~120 (route + 2 link buttons in wizard).

---

### Phase 3 — Staged import with database backing (fixes G6, R3, R4)

**New migration:** `supabase/migrations/20260806_import_batches.sql`

```sql
CREATE TABLE import_batches (
    batch_uid           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES tenants(tenant_uid) ON DELETE CASCADE,
    uploaded_by_uid     UUID NOT NULL REFERENCES users(user_uid),
    filename            TEXT NOT NULL,
    row_count           INT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('staged', 'committed', 'abandoned')),
    conflict_strategy   TEXT CHECK (conflict_strategy IN ('update', 'skip', 'fail')),
    label_uids          UUID[],  -- labels to apply to the whole batch
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    committed_at        TIMESTAMPTZ
);

CREATE INDEX idx_import_batches_tenant ON import_batches(tenant_uid, status);

CREATE TABLE import_batch_rows (
    row_uid             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_uid           UUID NOT NULL REFERENCES import_batches(batch_uid) ON DELETE CASCADE,
    row_number          INT NOT NULL,  -- 1-based, matches spreadsheet
    wa_phone            TEXT NOT NULL,
    name                TEXT,
    email               TEXT,
    preferred_language  TEXT,
    country_code        CHAR(2),
    timezone            TEXT,
    date_of_birth       DATE,
    notes               TEXT,
    opt_in_source       TEXT,
    validation_status   TEXT NOT NULL CHECK (validation_status IN ('valid', 'invalid')),
    validation_errors   JSONB,  -- [{ field, message }]
    exclude             BOOLEAN NOT NULL DEFAULT false,  -- user unchecked this row in review
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_batch_rows_batch ON import_batch_rows(batch_uid);
CREATE INDEX idx_import_batch_rows_wa_phone ON import_batch_rows(batch_uid, wa_phone);  -- duplicate detection
```

**`contact_source_events` FK addition:**

```sql
ALTER TABLE contact_source_events
    ADD CONSTRAINT fk_import_job_uid
    FOREIGN KEY (import_job_uid) REFERENCES import_batches(batch_uid) ON DELETE SET NULL;
```

Now the dangling comment in `20260805_contacts_module.sql:384` is fulfilled.

**API changes:**

1. **`POST /api/contacts/import`** becomes **two separate routes:**

   - **`POST /api/contacts/import/parse`** (replaces the old "preview" mode):
     - Parses the file
     - Validates every row
     - Writes `import_batches` + `import_batch_rows` to staging
     - Returns `{ batchUid, rowCount, validCount, invalidCount }`

   - **`POST /api/contacts/import/commit`** (replaces the old "commit" mode):
     - Reads `import_batch_rows` where `batch_uid = ? AND validation_status = 'valid' AND exclude = false`
     - Applies the conflict strategy
     - Writes to `contacts` in batches
     - Writes `contact_source_events` with `import_job_uid = batch_uid` (D-110 provenance)
     - Applies labels with `applied_by_module = 'csv_import'`, `applied_by_ref_uid = batch_uid`
     - Stamps `import_batches.status = 'committed'`, `committed_at = now()`
     - Returns the same result format as today

2. **New routes:**

   - **`GET /api/contacts/import/batches/:batchUid`** → returns batch metadata + paginated rows
   - **`PATCH /api/contacts/import/batches/:batchUid/rows/:rowUid`** → toggle `exclude` flag on one row
   - **`DELETE /api/contacts/import/batches/:batchUid`** → abandon a staged batch (sets `status = 'abandoned'`, does not cascade-delete rows for audit trail)

**Wizard UI changes (`ImportWizard.tsx`):**

Current: upload → map → result (3 steps)

New: upload → map → **review** → commit → result (5 steps)

**Step 3 (new): Review**

- Shows a paginated table of `import_batch_rows` (50 rows/page)
- Columns: `[x]` checkbox (exclude toggle) | row # | wa_phone | name | email | opt_in_source | validation status (✓ valid / ✗ invalid with hover-tooltip errors)
- Invalid rows are shown but greyed out and always excluded
- "Select All Valid" / "Deselect All" buttons at the top
- **Label picker** at the top: multi-select dropdown fetching from `GET /api/contacts/labels?tenant_uid=...`, applies to all non-excluded rows
- Bottom: "Back to Mapping" | "Commit Import (N contacts)" button (N = valid non-excluded count)

**Step 4: Commit (progress)**

- Calls `POST /api/contacts/import/commit` with `{ batchUid, labelUids }`
- Shows a spinner + live count update if the API returns progress (optional: make the commit route SSE-streaming for large batches, or just return the full result at the end)

**Step 5: Result (unchanged except now it links to the batch for audit)**

- Same stats as today
- Adds a "View Import Audit" link → `/contacts/imports/:batchUid` (new audit page showing what was uploaded vs what landed)

**Estimated lines:** ~600 (migration + 4 API routes + wizard step + review table component + label picker).

---

### Phase 4 — Import audit page (optional, gives you the full trail)

**New page:** `app/(platform)/contacts/imports/[batchUid]/page.tsx`

Shows:
- Batch metadata (filename, uploaded by, date, status)
- Committed stats (if status = 'committed')
- Table of `import_batch_rows` with side-by-side columns: "Uploaded Row" | "Created Contact" (links to `/contacts/:contact_uid` if it exists)
- Filter toggles: Show All / Valid Only / Invalid Only / Excluded

This is the "what did that file actually do" page. Useful for compliance and debugging.

**Estimated lines:** ~180.

---

### Phase 5 — List filtering + in-page edit modal (fixes G12, G13; delivers R9)

New in Revision 2.

**5.1 — Filter bar (R9, per D7).**

A collapsible row directly under the toolbar. Collapsed it is a single **"Filters"** chip showing the active count; expanded it shows:

| Control | Type | Source |
|---|---|---|
| Labels | multi-select chips | `GET /api/contacts/labels` — same list the `LabelPicker` uses |
| Consent | segmented control | `opted_in` / `opted_out` / `unknown` / any |
| Country | select | the same three-country list as `CountrySelect` |
| Source | select | distinct `opt_in_source` values for the tenant |
| Created | preset buttons | Today · 7d · 30d · Custom range |

Active filters render as removable chips above the table, and the whole filter state is mirrored into the URL query string so a filtered view can be bookmarked, shared, and survives a refresh.

**5.2 — Filtering moves server-side.**

Today `page.tsx:44` does `select('*')` and filters in the browser (G5). Label filtering needs a join, so this is the natural point to fix it:

- New `getContactList(tenantUid, filters, page)` in `lib/contacts/queries.ts`
- Label filter → `.select('*, contact_labels!inner(label_uid)')` + `.in('contact_labels.label_uid', labelUids)`
- Consent / country / source → `.eq()`; date range → `.gte()` / `.lte()`
- Text search → `.or('name.ilike.%q%,wa_phone.ilike.%q%,email.ilike.%q%')`
- `.range()` for pagination, with a `count: 'exact'` head query for the total

**Possible index migration:** if the label join is slow, `contact_labels` needs an index on `(label_uid)` — its primary key is `(contact_uid, label_uid)`, so lookups *by label* have no index today. That would be a **new** file, `supabase/migrations/20260806_contact_label_indexes.sql` — see §10. I'd measure before adding it rather than adding it speculatively.

**5.3 — Row edit modal (R9, no navigation).**

Each row gets a pencil icon-button on the right (and the row itself still links to the detail page, so both paths exist):

- Clicking the pencil opens `<ContactEditModal>` — a fixed-position overlay, not a route
- Inside it: the **same `ContactForm` from Phase 0**, in `mode="edit"`, pre-filled from the row (plus a fetch for labels and custom fields)
- Save → `PATCH /api/contacts/[id]` → modal closes → the row updates in place without a full page reload
- Escape / backdrop click closes it, with a confirm prompt if fields were touched

This is why Phase 0 comes first: the modal is a wrapper around an already-correct form, not a second implementation of it.

**Estimated lines:** ~450 (filter bar ~180, server-side query rewrite ~120, edit modal ~150).

---

## 6. Build order (if you approve the plan)

| # | Phase | Delivers | Est. |
|---|---|---|---|
| 1 | **Phase 0** — contact form rework | R5, R6, R7, R8 · G8–G11 | 3–4 hrs |
| 2 | **Phase 1** — toolbar + stats + clickable rows | R1 · G1–G4 | 1–2 hrs |
| 3 | **Phase 2** — sample downloads | R2 · G7 | 30 min *(blocked on `npm install xlsx`)* |
| 4 | **Phase 5** — filter bar + edit modal | R9 · G12, G13 | 3–4 hrs |
| 5 | **Phase 3** — staged import | R3, R4 · G6 | 4–6 hrs *(the big one)* |
| 6 | **Phase 4** — import audit page | — | 1 hr *(optional)* |

**Why Phase 0 first:** the edit modal in Phase 5 wraps the same `ContactForm`, and the import review step in Phase 3 reuses the same `LabelPicker`. Building the form and the picker correctly once, at the start, means neither of those later phases needs a rewrite.

**Why Phase 5 before Phase 3:** it's the smaller of the two and it makes the contacts page fully usable on its own. Phase 3 is the largest single chunk and the only one that needs a migration, so it's the natural last major step.

**Total:** ~13–18 hours across all six. Phases 0, 1, 2 and 5 are independent of Phase 3 — I can land those first if you want visible progress before the import rework starts.

---

## 7. What I need from you before I start

| # | Decision | My recommendation |
|---|---|---|
| D1 | Client-side vs database staging for import review | **B — database staging** (audit trail, refresh-survival, pagination) |
| D2 | Gate the XLSX sample, or `npm install xlsx` | **D2b — install it** |
| D3 | Which analytics chips | **Consent breakdown** (Total / In / Out / Unknown) |
| D4 | Shared `CountrySelect` vs inline | **D4a — extract**, and move the flag SVGs to `components/ui/flags.tsx` |
| D5 | Timezone as a hidden constant vs a visible locked chip | **D5b — visible, disabled, `IST (Asia/Kolkata)`** |
| D6 | Label UX | **Modal picker**, reused by form + import review + filter bar |
| D7 | Filter fields | **Labels, consent, country, source, created-date** |

Plus:

8. **Approval to run two new migrations** — `20260806_import_batches.sql` (Phase 3) and, only if measurement shows it's needed, `20260806_contact_label_indexes.sql` (Phase 5.2). Both are new files; nothing existing is touched (§10).
9. **Confirmation that `20260805_contacts_module.sql` has actually been applied** to your live database. Every phase here assumes `contacts`, `labels`, `contact_labels`, and `contact_source_events` exist.
10. **Any changes to the review-step UX** (paginated table with exclude checkboxes + label picker).

---

## 8. Open questions

**Q1 — Export CSV from the toolbar (secondary action):**
Should it export all contacts, or respect the current search/filter state? And should it include custom fields as JSON, or flatten them into columns?

**Q2 — Refresh button:**
Force a client-side re-fetch, or is this redundant given the page already loads fresh data on mount?

**Q3 — Abandoned batches:**
How long should they stay in the database before cleanup? Proposal: keep for 30 days, then a cron job (or manual SQL) deletes `status = 'abandoned' AND created_at < now() - interval '30 days'`.

**Q4 — Breadcrumb navigation:**
The `/contacts/[id]` detail page already has a breadcrumb at line 63 (`Platform → Contacts → [Name]`). The form pages (`/contacts/new`, `/contacts/import`) do not. Should they get one too?

---

## 9. What stays the same (no changes needed)

- Server-side validation (`lib/contacts/validation.ts`) — already correct, reused as-is
- CSV parser (`lib/contacts/csv-parser.ts`) — working, no changes
- Contact detail page, timeline, consent panel — all from the earlier session, untouched
- The mutations layer (`lib/contacts/mutations.ts`) — `upsertContact()` is still the write path
- RLS policies on `contacts`, `labels`, `contact_labels` — already exist and are correct

---

## 10. Migration policy (restated from §0)

**Every schema change gets a new dated file in `supabase/migrations/`.** Never edit, amend, or "fix" an existing migration — including files written earlier in the same session — because they have already been executed against the live database and modifying one destroys the record of what actually ran. Corrections roll *forward* in a new file.

**This plan proposes two new migrations:**

1. **`supabase/migrations/20260806_import_batches.sql`** (Phase 3) — creates `import_batches`, `import_batch_rows`, and adds the FK from `contact_source_events.import_job_uid` to `import_batches.batch_uid`, fulfilling the dangling-FK comment in the original schema.

2. **`supabase/migrations/20260806_contact_label_indexes.sql`** (Phase 5, *conditional*) — only if measurement shows label-join filtering is slow. Adds `CREATE INDEX idx_contact_labels_label ON contact_labels(label_uid);` to accelerate `WHERE label_uid IN (...)` queries. The table's primary key is `(contact_uid, label_uid)`, so lookups *by contact* are indexed but lookups *by label* are not.

**The existing `20260805_contacts_module.sql` is never touched.** It already defines `contacts`, `labels`, `contact_labels`, `contact_source_events`, and their RLS policies; Phase 0–5 build on top of that foundation without altering it.

---

## Summary (TL;DR for fast approval)

**What's broken:** Contact form uses raw inputs instead of the house components, no client-side validation, country/timezone are free text, labels can't be attached anywhere, no filtering by anything except name/phone, editing requires full-page navigation, import goes straight to DB with no review, no sample files, no toolbar.

**What I'll build (six phases, 13–18 hours):**

| # | Phase | Fixes | Est. |
|---|---|---|---|
| 0 | Contact form rework: `FormField` adoption, `contactFormSchema`, `CountrySelect` with Nepal flag SVG, IST locked, `LabelPicker` modal | R5–R8, G8–G11 | 3–4 hrs |
| 1 | Toolbar: search + 4 consent chips + New/Import buttons + stats API + clickable rows | R1, G1–G4 | 1–2 hrs |
| 2 | Sample CSV/XLSX downloads | R2, G7 | 30 min |
| 5 | Filter bar (labels/consent/country/source/date) + in-page edit modal | R9, G12–G13 | 3–4 hrs |
| 3 | Staged import: database backing + review step + label picker | R3–R4, G6 | 4–6 hrs |
| 4 | Import audit page | — | 1 hr (optional) |

**What you decide (§7):**

| # | Decision | My vote |
|---|---|---|
| D1 | Client-side vs database staging | **B — database** |
| D2 | Gate XLSX sample vs install `xlsx` | **D2b — install it** |
| D3 | Analytics chips | **Consent breakdown** |
| D4 | Shared `CountrySelect` vs inline | **D4a — extract + shared `flags.tsx`** |
| D5 | Timezone hidden vs visible-locked | **D5b — visible IST chip** |
| D6 | Label UX | **Modal picker** |
| D7 | Filter fields | **Labels, consent, country, source, created-date** |

**Ready to build when you give the word.**

---

## Appendix — Verification run (2026-08-05, after the plan was written)

A shell became available, so I ran `npx tsc --noEmit` against the 16 contacts-module files that had never been compiled. Results:

**Two real errors found and fixed:**

| File | Error | Fix |
|---|---|---|
| `app/(platform)/contacts/[id]/page.tsx:46-47` | `Property 'id' does not exist on type 'Promise<{ id: string }>'` — the page awaited `params` into `contactUid` on line 18, then still passed `params.id` to both query calls | Changed both call sites to use `contactUid`. **This was a genuine runtime bug**: the detail page would have passed a Promise object where a uuid string was expected, and every contact detail page would have 404'd. |
| `lib/contacts/csv-parser.ts:115` | `Cannot find module 'xlsx'` — the `await import('xlsx')` was statically resolvable, so the absent optional dependency broke the whole typecheck | Moved the specifier into a variable so TS stops resolving it at build time. The runtime `try/catch` and its actionable error message are unchanged. |

**Result: zero typecheck errors remain in any contacts-module file.**

**Pending item resolved — `user_tenants` column name.** I flagged a risk that my new code's `.eq('user_uid', user.id)` might not match the live column, since `app/login/page.tsx:134` hedges with `.or('user_uid.eq...,user_id.eq...')`. Confirmed correct:
- `supabase/migrations/20260802_rename_uuid_columns.sql:30` — `ALTER TABLE public.user_tenants RENAME COLUMN user_id TO user_uid`
- `supabase/migrations/20260802_complete_clean_reset.sql:65` — recreates the table with `user_uid`

`user_uid` is the live column. All new pages and routes resolve their tenant correctly; the login page's `.or()` is legacy defensiveness, not a signal.

**Pre-existing breakage outside this module (27 errors, not mine, not fixed).** All remaining typecheck errors are in the **inbox** module and are Next.js 15 migration misses:
- `app/api/inbox/conversations/[id]/{route,messages/route,send/route}.ts` — `cookies()` is not awaited (`Property 'getAll' does not exist on type 'Promise<ReadonlyRequestCookies>'`) and `params` is typed as a plain object instead of a Promise
- `app/api/inbox/conversations/route.ts`
- `.next/types/validator.ts` — Next's generated route validator rejecting the three handlers above

These will fail `npm run build`. They are a separate module and outside this plan's scope — **say the word and I'll fix them as a standalone pass**, but I have not touched them.

A shell became available, so I ran `npx tsc --noEmit` against the 16 contacts-module files that had never been compiled. Results:

**Two real errors found and fixed:**

| File | Error | Fix |
|---|---|---|
| `app/(platform)/contacts/[id]/page.tsx:46-47` | `Property 'id' does not exist on type 'Promise<{ id: string }>'` — the page awaited `params` into `contactUid` on line 18, then still passed `params.id` to both query calls | Changed both call sites to use `contactUid`. **This was a genuine runtime bug**: the detail page would have passed a Promise object where a uuid string was expected, and every contact detail page would have 404'd. |
| `lib/contacts/csv-parser.ts:115` | `Cannot find module 'xlsx'` — the `await import('xlsx')` was statically resolvable, so the absent optional dependency broke the whole typecheck | Moved the specifier into a variable so TS stops resolving it at build time. The runtime `try/catch` and its actionable error message are unchanged. |

**Result: zero typecheck errors remain in any contacts-module file.**

**Pending item resolved — `user_tenants` column name.** I flagged a risk that my new code's `.eq('user_uid', user.id)` might not match the live column, since `app/login/page.tsx:134` hedges with `.or('user_uid.eq...,user_id.eq...')`. Confirmed correct:
- `supabase/migrations/20260802_rename_uuid_columns.sql:30` — `ALTER TABLE public.user_tenants RENAME COLUMN user_id TO user_uid`
- `supabase/migrations/20260802_complete_clean_reset.sql:65` — recreates the table with `user_uid`

`user_uid` is the live column. All new pages and routes resolve their tenant correctly; the login page's `.or()` is legacy defensiveness, not a signal.

**Pre-existing breakage outside this module (27 errors, not mine, not fixed).** All remaining typecheck errors are in the **inbox** module and are Next.js 15 migration misses:
- `app/api/inbox/conversations/[id]/{route,messages/route,send/route}.ts` — `cookies()` is not awaited (`Property 'getAll' does not exist on type 'Promise<ReadonlyRequestCookies>'`) and `params` is typed as a plain object instead of a Promise
- `app/api/inbox/conversations/route.ts`
- `.next/types/validator.ts` — Next's generated route validator rejecting the three handlers above

These will fail `npm run build`. They are a separate module and outside this plan's scope — **say the word and I'll fix them as a standalone pass**, but I have not touched them.
