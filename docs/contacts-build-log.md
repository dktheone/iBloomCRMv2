# Contacts Module — Build Log

**Purpose:** running record of everything built or modified for the Contacts
module, phase by phase, against
[`contacts-toolbar-and-staged-import-plan.md`](./contacts-toolbar-and-staged-import-plan.md).

**Started:** 2026-08-05
**Plan revision being executed:** Revision 2
**Build order (plan §6):** Phase 0 → 1 → 2 → 5 → 3 → 4

> Standing rule in force for this whole build: **never edit an applied
> migration.** Every schema change is a new dated file under
> `supabase/migrations/`. `20260805_contacts_module.sql` is treated as
> immutable.

---

## ✅ Phase 0 — Contact form rework (COMPLETE)

Delivers **R5** (Zod validation + compact icon/subtext layout + highlighted
input box), **R6** (country select, 3 countries, India default, flags),
**R7** (timezone fixed to IST), **R8** (source `manual` + labels attached
from the form via an in-page modal).

### Files created

| # | Path | Purpose |
|---|---|---|
| 1 | `components/ui/flags.tsx` | Shared inline SVG flags — `IndiaFlagSvg`, `NepalFlagSvg`, `UsFlagSvg` |
| 2 | `components/ui/CountrySelect.tsx` | 3-country select with flags, FormField-matched error styling |
| 3 | `lib/contacts/constants.ts` | `DEFAULT_TIMEZONE`, `DEFAULT_COUNTRY`, `COUNTRY_OPTIONS`, `LANGUAGE_OPTIONS`, `LABEL_COLORS`, label-provenance constants |
| 4 | `app/api/contacts/labels/route.ts` | `GET` list tenant labels · `POST` create label |
| 5 | `app/api/contacts/[contactUid]/labels/route.ts` | `POST { add, remove }` — attach/detach labels with D-110 provenance |
| 6 | `components/contacts/LabelPicker.tsx` | In-page modal: search, multi-select, inline create with 8-colour palette |

### Files modified

| Path | Change |
|---|---|
| `components/ui/PhoneInput.tsx` | Flags moved out to `flags.tsx`; **Nepal (+977) added**; prefix matching reordered longest-first; new `disabled` prop (trigger, input, and popover all respect it) |
| `lib/validations/schemas.ts` | Added §4 `contactFormSchema` + `ContactFormValues`, §5 `createLabelSchema` |
| `lib/types/inbox.ts` | Added `Label` interface (the `labels` row itself, distinct from the existing `ContactLabel` application record) |
| `components/contacts/ContactForm.tsx` | **Full rewrite** — see below |

### `ContactForm.tsx` rewrite — what actually changed

| Before | After |
|---|---|
| Raw `<input>` + `<label>` per field | `FormField` (icon + subtext + highlighted box) |
| Single `error: string` banner | `fieldErrors` record, per-field, red box + `↳ message` subtext |
| Ad-hoc regex in `handleSubmit` | `contactFormSchema.safeParse()` → `issue.path[0]` → `fieldErrors`, matching the setup page's pattern exactly |
| Free-text phone | `PhoneInput` (flag + dial-code trigger), `disabled` in edit mode |
| Free-text country, `maxLength={2}`, uppercased | `CountrySelect` — India / Nepal / USA only, **India default** |
| Free-text timezone | Read-only `IST (Asia/Kolkata)` chip; submit always sends `DEFAULT_TIMEZONE` |
| 8 hardcoded `<option>` languages | `LANGUAGE_OPTIONS` from constants (11, India-weighted) |
| No labels | Labels card + chips + `LabelPicker` modal; on success, selected labels `POST` to `/api/contacts/[id]/labels` |
| `setError()` on failure | `toast.error()` / `toast.success()` via `sonner` |
| — | D-032 amber consent note **preserved** |

### Decisions applied

- **D-110** — every label application from this form records
  `applied_by_uid = user.id` and `applied_by_module = 'manual'`.
- **D-032** — the form still never sets `opt_in_status`; new contacts stay
  `unknown`. The amber note explaining this was kept.
- **D-034** — creation and edit both go through `upsertContact()` via
  `/api/contacts`; no second write path was introduced.

### Notes / deliberate choices

- **No migration needed for Phase 0.** `labels` and `contact_labels` already
  exist in `20260805_contacts_module.sql` (lines 168–207). Phase 0 is UI + API
  only.
- **Country literals are duplicated** between `lib/contacts/constants.ts` and
  `lib/validations/schemas.ts`. This is intentional: `constants.ts` imports the
  React flag components, and `schemas.ts` is imported by server code — importing
  one into the other would drag TSX into the server bundle. The duplication is
  three strings and is commented at both sites.
- **`LabelPicker` never writes to `contact_labels` itself.** It only reports
  which labels are ticked; the caller persists. That's what lets the same
  component serve the create form, the edit modal (Phase 5), the import review
  step (Phase 3), and the filter bar (Phase 5).
- `onLabelsLoaded` is held in a ref inside `LabelPicker` so callers can pass an
  inline arrow function without re-triggering the fetch.

### Verification

```
npx tsc --noEmit
→ 24 errors, all in app/api/inbox/**  (pre-existing, unrelated to contacts)
→ 0 errors in any contacts / validations / components file
```

**Not yet verified in a browser.** No runtime click-through of the form,
the label modal, or the label API has been performed.

---

## ✅ Phase 1 — Toolbar on `/contacts` (COMPLETE)

Delivers **R1** — a horizontal bar carrying both the actions and the analysis
that were previously missing from `/contacts`.

### Files created

| # | Path | Purpose |
|---|---|---|
| 1 | `components/contacts/ContactsToolbar.tsx` | Two-row toolbar: consent-breakdown chips + search/actions. Exports `ContactsToolbar`, `ContactStats` |

### Files modified

| Path | Change |
|---|---|
| `app/(platform)/contacts/page.tsx` | Old search-only bar replaced by `<ContactsToolbar>`; `loadContacts` lifted out of `useEffect` into a `useCallback` so **Refresh** can re-invoke it; `stats` computed with `useMemo`; rows made clickable; empty state rewritten; label chip contrast bug fixed |

### What the toolbar contains

**Row 1 — analysis.** Four count chips reading straight off the loaded rows:
Total (slate), Opted In (emerald), Opted Out (rose), Unknown (amber).

**Row 2 — actions.** Search box (name / phone / email) on the left; on the
right a `{children}` slot, then **Refresh**, **Import** → `/contacts/import`,
**New Contact** → `/contacts/new`.

The `{children}` slot exists so Phase 5 can drop its filter controls into the
same bar rather than adding a third row.

### Deviation from the plan — stats are client-side

The plan (decision D3) called for a `GET /api/contacts/stats` endpoint to feed
the chips. **Not built.** The page already fetches every contact row it renders,
so the four numbers are derived from that array with `useMemo`. A second round
trip would have bought nothing except a way for the chips and the table to
disagree with each other.

This becomes wrong the moment the list is paginated server-side — at that point
the chips would describe only the current page. If/when Phase 5 introduces
server-side paging, `/api/contacts/stats` must come back. Noted as a
**revisit-on-pagination** item.

### Other fixes folded in

- **Empty state was lying.** It said *"Contacts are automatically created when
  test broadcasts or WhatsApp messages are sent"* — untrue since Phase 0 added
  manual creation. Now branches on whether a search is active: a no-match
  message when searching, and otherwise accurate copy plus **New Contact** /
  **Import Contacts** buttons.
- **Label chip contrast bug.** Chips previously set the user-picked label colour
  as `backgroundColor` while leaving the dark text class in place — unreadable
  at dark hues. Colour now renders as a 1.5px dot on a neutral chip, matching
  the chips in `ContactForm`.
- **Rows are clickable** → `/contacts/{contact_uid}`, with `cursor-pointer`.
  This was listed as an unwired navigation gap in
  `contacts-implementation-status.md` §Next Steps.
- The old standalone "👤 N Total Contacts" header pill was removed — the Total
  chip in the toolbar replaces it.

### Verification

```
npx tsc --noEmit
→ 27 errors, all in app/api/inbox/**  (pre-existing, unrelated)
→ 0 errors in any contacts file
```

**Not yet verified in a browser.**

## ⬜ Phase 2 — Sample downloads (NOT STARTED)

Delivers **R2**. Needs `npm install xlsx` (decision D2b).

## ⬜ Phase 5 — Filters + edit modal (NOT STARTED)

Delivers **R9**. Filter bar (labels, consent, country, source, created-date) and
an edit modal wrapping the Phase 0 `ContactForm`.

## ⬜ Phase 3 — Staged import (NOT STARTED)

Delivers **R3** + **R4**. New migration `20260806_import_batches.sql`.

## ⬜ Phase 4 — Import audit page (NOT STARTED, optional)

---

## ✅ Side change — admin contact picker on `/validation` (2026-08-06)

Not part of the numbered phases; requested separately. `/validation` is a
super-admin-only page, so its **Dispatch Test Message** form now offers the
tenant's `admin`-labelled contacts as test recipients instead of requiring the
number to be typed from memory.

### Files modified

| Path | Change |
|---|---|
| `app/(platform)/validation/page.tsx` | Recipient Phone Number field gained an admin-contact picker; added `AdminContact` type, `ADMIN_LABEL_NAME`, `toE164()`, `loadAdminContacts()` |

### How it works

- Label matched **case-insensitively** on `labels.name = 'admin'` (`ilike`), so
  `Admin` / `ADMIN` all resolve.
- Membership read through **`contact_labels_active`**, not `contact_labels` — an
  expired label application (D-110) must not keep granting test-send access.
- Resolved in **three sequential queries** (labels → active links → contacts)
  rather than one nested PostgREST select. `contact_labels_active` is a view,
  and embedded-resource joins off a view aren't reliably inferable by PostgREST.
  RLS scopes every step to the caller's tenant.

### Deliberate choices

- **The input stays free-text.** The picker fills it; it does not replace it.
  Validation frequently needs a number that isn't a contact yet (a brand-new
  test handset, a Meta sandbox number), and turning the field into a hard select
  would remove that. A subtext line under the input says which it is — the
  matched contact's name, or *"Manual number — not in the admin contact list"*.
- **Opt-in status is shown, not enforced.** Each row carries its consent badge
  (✅ / ⛔ / ❔). The page does not block sending to an `opted_out` admin
  contact, because the server-side send path is the correct place to enforce
  D-032 — a client-side block here would be both bypassable and duplicative.
  **Worth confirming that `/api/meta/send-template` actually does enforce it**;
  that was not verified as part of this change.
- **Phone normalisation.** `contacts.wa_phone` stores E.164 digits with no
  leading `+`; this form and the Meta route both want the `+`. `toE164()`
  normalises in one place and is used for both display and match-detection.
- Empty state tells the admin exactly what to do — add the `admin` label to a
  contact — and reminds them manual entry still works.

### Verification

```
npx tsc --noEmit
→ 27 errors, all in app/api/inbox/**  (pre-existing, unrelated)
→ 0 errors in app/(platform)/validation/page.tsx
```

**Not yet verified in a browser.** In particular the picker has never been
opened against real data, so it is unconfirmed whether any contact currently
carries an `admin` label.

---

## Outstanding items

1. **Confirm `20260805_contacts_module.sql` is applied to the live database.**
   Everything in Phase 0 assumes `labels` / `contact_labels` /
   `contact_labels_active` exist. Still unconfirmed.
2. ~~**27 pre-existing typecheck errors in the inbox module**~~ — **RESOLVED
   2026-08-06.** All four `app/api/inbox/conversations/**` routes now import the
   shared `createClient()` / `createAdminClient()` helpers instead of
   hand-rolling their own, and await `params`. `npx tsc --noEmit` is clean and
   `npm run build` succeeds (45 routes). Details in
   [`inbox-messaging-loop-and-webhook-plan.md`](./inbox-messaging-loop-and-webhook-plan.md)
   § Build log.
3. **No browser testing yet** for any contacts surface.
4. **Revisit `/api/contacts/stats` if the list ever paginates server-side.**
   Phase 1's chips are computed from the loaded rows; under paging they would
   silently describe only the current page.
