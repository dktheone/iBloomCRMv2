# Messaging Loop Readiness + WhatsApp Webhook Plan

**Written:** 2026-08-06
**Scope:** (A) how ready we are for the `/validation` → conversation → `/inbox`
loop you described, (B) a full plan for the WhatsApp webhook we have never
built, (C) an enumeration of every webhook activity Meta can send us and what
each one is worth to us later.

**Nothing in this document has been implemented.** It is for review first, per
the standing rule that plans come before code.

> Standing rule reaffirmed: **no applied migration is ever edited.** Every
> schema change below is a new dated file under `supabase/migrations/`.

---

## Part A — Readiness of the loop you described

Your description, broken into its eight parts, each with an honest verdict.

| # | What you asked for | Verdict | Where it stands |
|---|---|---|---|
| 1 | Pick a contact on `/validation` and send | ✅ **Built** | Admin-label picker shipped 2026-08-06; `POST /api/meta/send-template` sends via Graph |
| 2 | That send creates a new conversation | ✅ **Built** | `send-template/route.ts` already does contact → conversation → message upsert |
| 3 | Conversation appears in `/inbox` left panel | ✅ **Built** | `ConversationList` + `conversations` query, ordered pinned-then-recent |
| 4 | Messages with history on the right | ✅ **Built** | `ChatThread` loads last 60 messages ascending |
| 5 | Input box for replies | ✅ **Built** | `Composer` + `POST /api/inbox/conversations/[id]/send` (full D-040 pipeline) |
| 6 | Separate button to select templates | ✅ **Built** | `TemplatePicker` modal in `Composer` — fetches approved templates, counts `{{n}}` placeholders, sends bindings |
| 7 | Attachment selection | ❌ **Not built** | Paperclip button has no `onClick`, no `<input type="file">`, no upload. **No Supabase Storage bucket exists anywhere in the repo.** |
| 8 | Single tick / double tick / blue double tick per message | ⚠️ **Half built** | Status column + all four timestamps exist. But `MessageBubble` renders `sent` and `delivered` with the **same glyph in the same grey** — and nothing ever advances a message past `sent`, because there is no webhook. |

### The headline

**The loop is far more built than it looks.** You can already send from
`/validation`, and it will already create a conversation you can open in
`/inbox` and reply to. What is missing is not the loop — it is everything that
makes the loop *live*:

1. **There is no webhook route.** `app/api/webhooks/**` does not exist. All 27
   API routes were enumerated; none is a webhook. So: no inbound messages ever
   arrive, no delivery/read receipt ever lands, no template-approval change
   ever syncs. Every message will sit at `sent` forever.
2. **Realtime is switched off.** `20260804_inbox_conversations_messages.sql`
   lines 251–252 have the publication statements **commented out**, yet
   `app/(platform)/inbox/page.tsx` subscribes to three `postgres_changes`
   channels. Those subscriptions currently receive nothing.
3. **Four routes fail typecheck**, which fails `npm run build` for the whole
   app — so none of this can be browser-tested in a production build yet.

### Confirmed defects (found by reading)

Status column updated as work lands — see the Build log at the end of this doc.

| # | Defect | File | Severity | Status |
|---|---|---|---|---|
| D1 | `params` typed as plain object; Next 15 makes it a `Promise`. 27 errors, blocks `npm run build` **app-wide** | all 4 `app/api/inbox/conversations/**` routes | 🔴 Blocker | ✅ Fixed — Step 1 |
| D2 | `cookies()` not awaited | `.../[id]/send/route.ts` | 🔴 Part of D1 | ✅ Fixed — Step 1 |
| D3 | Realtime publication commented out | `20260804_...sql:251-252` | 🔴 Breaks live updates | ✅ Migration written — Step 3 · ⚠️ not yet applied to DB |
| D4 | `sent` and `delivered` share one glyph and one colour | `MessageBubble.tsx` | 🟠 The exact thing you asked for | ⬜ Open — Step 6 |
| D5 | Paperclip is inert; no storage bucket exists | `Composer.tsx` | 🟠 Feature missing | ⬜ Open — Step 8 |
| D6 | Auto-created contacts get `opt_in_status: 'opted_in'` hardcoded — **fabricates consent, violates D-032** | `send-template/route.ts` | 🔴 Compliance | ✅ Fixed — Step 2 |
| D7 | No opt-out check before sending | `send-template/route.ts` | 🔴 Compliance | ✅ Fixed — Step 2, both send routes |
| D8 | Whole DB block wrapped in `try/catch` that only `console.error`s — a send can succeed at Meta and silently persist nothing | `send-template/route.ts` | 🟠 Silent data loss | ✅ Fixed — Step 2 |
| D9 | Preview trigger reads `content->>'name'` for templates, but both writers store `template_name`; `interactive` reads `->>'type'` where the original read `->'body'->>'text'` | `20260805_inbox_amendments.sql` | 🟠 Previews show fallbacks | ⬜ Open |
| D10 | `provider_secrets.encrypted_system_user_token` stores plaintext | `20260723_002_waba_provider.sql` | 🟠 Flagged in code comment already | ⬜ Open |

### What is genuinely good news

The **schema needs no changes to accept webhooks.** `20260804_inbox_conversations_messages.sql`
already has every column an inbound handler would want to write:

```sql
wa_message_id           TEXT UNIQUE,   -- the Meta wamid: our idempotency key
status                  TEXT CHECK (status IN ('queued','sent','delivered','read','failed')),
error_code TEXT, error_title TEXT, status_updated_at TIMESTAMPTZ,
sent_at, delivered_at, read_at, failed_at   TIMESTAMPTZ,
media_ref               JSONB,         -- MediaRef type already defined in lib/types/inbox.ts
reply_to_wa_message_id  TEXT,          -- threading / quoted replies
is_deleted              BOOLEAN,       -- for message-deleted events
message_type            CHECK IN (14 types incl. reaction, interactive, order, system, unknown)
```

`conversations` already carries `last_inbound_at`, `window_expires_at`,
`unread_count`, and `UNIQUE (tenant_uid, contact_uid, phone_line_uid)` — and
the `AFTER INSERT` trigger `update_conversation_on_message()` already refreshes
the 24-hour window on inbound and reopens a `resolved` conversation (D-113).

**So the webhook is almost pure new code, not a schema project.** Only two
small migrations are needed, both listed in Part B.

---

## Part B — Webhook setup plan

### B0. Where it lives

```
app/api/webhooks/meta/route.ts        # GET verify + POST receive. Thin.
lib/webhooks/verify-signature.ts      # X-Hub-Signature-256 HMAC
lib/webhooks/router.ts                # fan out by `field`
lib/webhooks/handlers/messages.ts     # inbound messages
lib/webhooks/handlers/statuses.ts     # delivery receipts
lib/webhooks/handlers/templates.ts    # template status/quality/category
lib/webhooks/handlers/account.ts      # WABA + phone-number health
lib/webhooks/handlers/preferences.ts  # marketing opt-out  ← compliance-critical
lib/webhooks/media.ts                 # Graph media download → Supabase Storage
```

The URL is **already configured** and already registered with Meta:
`config/platform.config.ts` → `webhookCallbackUrl` and `webhookVerifyToken`
exist, `/provider` displays them, and `.env.example` carries
`META_WEBHOOK_VERIFY_TOKEN` and `META_APP_SECRET`. We have been advertising an
endpoint we never built.

> ⚠️ **`meta_whatsapp_assets.json` shows every phone line currently points its
> webhook at `n8n.ibloomsolutions.com`, not at us.** Cutting over is a
> deliberate switch you need to make in the Meta dashboard, and it will move
> traffic off whatever n8n flow is live today. Worth confirming what that flow
> does before we take the traffic.

### B1. `GET` — verification handshake

Meta calls once when you save the callback URL:

```
GET /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
```

Compare `hub.verify_token` against `PLATFORM_CONFIG.webhookVerifyToken` using a
timing-safe compare, and on match return `hub.challenge` as **plain text with
status 200** — not JSON. Anything else and Meta refuses to save the URL.

### B2. `POST` — signature verification

Every delivery carries `X-Hub-Signature-256: sha256=<hex>`, an HMAC-SHA256 of
the **exact raw request body** keyed by the Meta **app secret**.

Two traps here:

- You must read the body as **raw text** (`await req.text()`) and verify
  *before* `JSON.parse`. Re-serialising parsed JSON changes whitespace and key
  order and the signature will never match.
- `PLATFORM_CONFIG.metaAppSecret` reads from `NEXT_PUBLIC_META_APP_SECRET` —
  **an app secret must never be `NEXT_PUBLIC_`**, that ships it to the browser.
  This plan adds a server-only `META_APP_SECRET` and uses that in the webhook.
  (The existing public one is a separate cleanup task.)

Compare with `crypto.timingSafeEqual`. On mismatch: **401, log, drop.**

### B3. Respond fast, process after

Meta expects a `200` quickly and **retries on any non-2xx or slow response** —
with exponential backoff for up to ~7 days. A handler that returns 500 on a bad
row will get that same row redelivered for a week.

So: verify signature → `200 OK` immediately → process. Any per-event failure is
caught, written to a dead-letter row, and **never** turned into a non-200.

Two follow-on consequences:

- **Events are not ordered.** A `delivered` status can arrive before `sent`.
  Status transitions must therefore be **monotonic**: only advance
  `queued → sent → delivered → read`, never regress. `failed` wins over
  everything.
- **Events are not unique.** Retries mean the same payload arrives twice.
  `messages.wa_message_id UNIQUE` is our idempotency key: inbound inserts use
  `ON CONFLICT (wa_message_id) DO NOTHING`.

### B4. Tenant resolution — the multi-tenancy hinge

The webhook is a **shared platform endpoint**; every tenant's traffic lands on
the same URL. Payloads identify themselves only by
`value.metadata.phone_number_id` (and `entry[].id` = the Meta WABA id).

```
value.metadata.phone_number_id
   → wa_phone_numbers.meta_phone_number_id   (UNIQUE)
   → phone_line_uid + tenant_uid
```

The webhook runs as `service_role`, which **bypasses RLS entirely**. Per the
project invariant, every single query in these handlers must therefore filter
by `tenant_uid` explicitly in code. If the phone_number_id resolves to no row,
the event is dead-lettered — never guessed at, never written to a default
tenant.

### B5. Inbound message handling

For each entry in `value.messages[]`:

1. **Upsert the contact** by `(tenant_uid, wa_phone)`. Name comes from
   `value.contacts[].profile.name`. `created_by_uid` stays null (webhook-created).
   **`opt_in_status` is left alone** — an inbound message is not consent, and
   `opted_out` is terminal (D-032). This is exactly the mistake D6 makes today.
2. **Upsert the conversation** on `(tenant_uid, contact_uid, phone_line_uid)`.
3. **Insert the message** with `direction: 'inbound'`, `wa_message_id` from
   `messages[].id`, `ON CONFLICT DO NOTHING`.
4. The existing trigger then does the rest: refreshes `window_expires_at` to
   +24h, bumps `unread_count`, writes the preview, reopens if `resolved` (D-113).
5. **Media types** (`image`/`video`/`audio`/`document`/`sticker`) insert with
   `media_ref.download_status = 'pending'`, then a follow-up job resolves it —
   see B6.

`context.id` on a reply maps straight to `reply_to_wa_message_id`. Reactions
carry the target wamid, matching the `ReactionContent` type already defined.

### B6. Media download — the piece with no foundation

Inbound media arrives as an **id only**. Fetching it is two Graph calls
(`GET /{media-id}` for a URL, then a bearer-authenticated `GET` on that URL),
and Meta's URLs expire in ~5 minutes. We must download and re-host.

**There is currently no Supabase Storage bucket in this repo at all** — no
`storage.from(...)` call anywhere. So this needs, as new work:

- a private bucket (`wa-media`), created via a new migration
- path convention `{tenant_uid}/{conversation_uid}/{message_uid}.{ext}` — the
  tenant prefix is what makes a storage RLS policy possible
- a storage RLS policy scoping reads to the owning tenant
- signed-URL generation at render time, not public URLs
- `media_ref.download_status` moving `pending → stored | failed`

**This is also what unblocks D5 (outbound attachments)** — the same bucket,
used in the other direction. `SendMessageRequest` in `lib/types/inbox.ts`
already has the media variants typed with `storage_path`, and the send route
already branches on them. Outbound attachments are genuinely close once the
bucket exists.

### B7. Status handling — this is what fixes your ticks

For each entry in `value.statuses[]`: look up by `wa_message_id`, then apply
monotonically:

| Meta status | Our column | Tick rendering |
|---|---|---|
| `sent` | `status='sent'`, `sent_at` | **single grey tick** ✓ |
| `delivered` | `status='delivered'`, `delivered_at` | **double grey tick** ✓✓ |
| `read` | `status='read'`, `read_at` | **double blue tick** ✓✓ |
| `failed` | `status='failed'`, `failed_at`, `error_code`, `error_title` | red warning |
| `deleted` | `is_deleted = true` | "This message was deleted" |

`MessageBubble` must change so `sent` uses a **single**-check icon
(`solar:check-circle-*` / a single `Check`) while `delivered` keeps the
double-check — today they are identical, which is defect D4 and precisely the
distinction you asked for.

The `statuses[].conversation` object also carries
`conversation.expiration_timestamp` — Meta telling us authoritatively when the
window closes. We should write that to `window_expires_at` rather than always
computing +24h ourselves, since Meta is authoritative on Meta-owned state.

`statuses[].pricing` (`billable`, `category`, `pricing_model`) is where per-
conversation cost analytics will come from later.

### B8. Migrations needed (both new files, nothing edited)

| File | Contents |
|---|---|
| `20260806_webhook_events.sql` | `webhook_events` raw-log + dead-letter table (`event_uid`, `received_at`, `field`, `meta_waba_id`, `phone_number_id`, `tenant_uid` nullable, `payload jsonb`, `status`, `error`, `attempts`). Append-only, service-role-only, RLS on. **Enable Realtime here too.** |
| `20260806_enable_realtime_inbox.sql` | The two `ALTER PUBLICATION supabase_realtime ADD TABLE` statements that were commented out — as a *new* file, since the original is applied and immutable. Also `REPLICA IDENTITY FULL` on `messages` so UPDATE payloads carry the full row (the inbox's status-update subscription needs this). |

A raw log is not optional here. When Meta redelivers something odd at 2am, the
payload is the only evidence, and it is also how we replay a batch after fixing
a handler bug.

### B9. Suggested build order

| Step | Work | Why here |
|---|---|---|
| 1 | Fix D1/D2 — Next 15 `params: Promise<>` + `await cookies()` in the 4 inbox routes | Blocks `npm run build`; nothing can be tested until this is done. ~20 min. |
| 2 | Fix D6/D7 — stop fabricating `opted_in`, enforce opt-out before send | Compliance. Small. Should not wait behind a feature. |
| 3 | Migration `20260806_enable_realtime_inbox.sql` | The inbox already subscribes; this makes those subscriptions do something. One file. |
| 4 | Migration `20260806_webhook_events.sql` | Prerequisite for any handler. |
| 5 | `GET` verify + `POST` signature + raw log + dead-letter, **no handlers** | Ship the skeleton; point Meta at it; watch real payloads land. This de-risks everything after it. |
| 6 | `statuses` handler + `MessageBubble` tick fix (D4) | **Delivers your tick requirement.** Purely additive. |
| 7 | `messages` handler (text + interactive first) | Inbound now works; the loop closes. |
| 8 | Storage bucket + media download + outbound attachments (D5) | Biggest single chunk. Both directions at once. |
| 9 | `message_template_status_update` handler | Templates stop needing manual sync. |
| 10 | `user_preferences` handler | Marketing opt-out honoured automatically — see Part C. |
| 11 | Remaining account/quality handlers | Feeds a future WABA-health module. |

Steps 1–3 are worth doing regardless of whether you approve the rest — they are
fixes to things already built and already broken.

### B10. Local testing

Meta cannot reach `localhost`. Options: an `ngrok`/Cloudflare tunnel pointed at
`localhost:3000` with the tunnel URL saved in the Meta dashboard, **or** a
`scripts/replay-webhook.ts` that POSTs a recorded payload with a correctly
computed signature. The second is better for repeatable work and costs almost
nothing once `webhook_events` stores real payloads to replay.

---

## Part C — Every WhatsApp webhook activity, and what we would do with it

Subscribed on the `whatsapp_business_account` object. The platform-level Meta
App subscribes once; each tenant WABA is subscribed at onboarding.

> **Verify before wiring.** This list reflects the WhatsApp Business Platform
> webhook fields as documented; the exact set available to us depends on our
> API version (`v25.0`) and our app's approved permissions. Before
> implementation, the authoritative check is the field list shown in the Meta
> App Dashboard under WhatsApp → Configuration → Webhook fields. Some of these
> (Flows, Calling, SMB echoes, history) require permissions or product
> enrolments we may not currently hold.

### C1. `messages` — the main one

One field, but it carries three different arrays.

**`value.messages[]` — inbound, by `type`:**

| Type | Contains | Our handling | Future module |
|---|---|---|---|
| `text` | `text.body` | `TextContent` | Inbox |
| `image` `video` `audio` `document` `sticker` | media `id`, `mime_type`, `sha256`, `caption`, `filename` | `MediaContent` + B6 download | Inbox, media library |
| `location` | lat/long/name/address | `LocationContent` (typed already) | Field ops, delivery |
| `contacts` | vCard array | `contacts` type | Referral capture |
| `reaction` | `emoji` + target wamid | `ReactionContent` (typed already) | Inbox |
| `interactive` | `button_reply` / `list_reply` / `nfm_reply` (Flow submission) | `InteractiveContent` (typed already) | **Bot/flow engine — this is how a bot reads answers** |
| `button` | quick-reply tap on a template | Attribute back to the sent template | Campaign analytics |
| `order` | product items, catalog id | `order` type in the CHECK already | Commerce module |
| `system` | customer changed their number | Migrate `wa_phone` on the contact | Contacts hygiene |
| `unknown` | unsupported/new type | Store raw, render placeholder | Forward-compat |

**Cross-cutting sub-objects on a message:**

- `context` — `{ from, id, forwarded, frequently_forwarded, referred_product }`.
  `context.id` → `reply_to_wa_message_id`, giving quoted-reply threading.
- `referral` — present when the user arrived from a **Click-to-WhatsApp ad**:
  `source_url`, `source_type`, `source_id`, `headline`, `body`, `media_type`,
  `ctwa_clid`. This is a genuinely valuable one — it is the only way to
  attribute a conversation to an ad, and it should be stored on the
  *conversation* (or on `contacts.custom_fields`), not just the message.
  Feeds a future attribution/ROI module.
- `identity` — set when the user's identity changed (number re-registered on a
  new device). Security-relevant; worth an activity-log entry.

**`value.statuses[]`** — `sent` / `delivered` / `read` / `failed` / `deleted`,
plus `conversation{id, origin.type, expiration_timestamp}`, `pricing{billable,
category, pricing_model}`, and `errors[]`. Covered in B7. `origin.type`
(`marketing` / `utility` / `authentication` / `service` / `referral_conversion`)
is what a billing-analytics module would group by.

**`value.errors[]`** — account-level errors not tied to a message. Dead-letter
and surface on a health page.

### C2. Template lifecycle

| Field | Payload | Our handling |
|---|---|---|
| `message_template_status_update` | `APPROVED` / `REJECTED` / `PENDING` / `PAUSED` / `DISABLED` + `reason` | Update `wa_templates.status`. **Removes the need for manual sync** — currently `/templates` only knows what it last pulled. |
| `message_template_quality_update` | quality score green/yellow/red | Store on the template; warn before a broadcast uses a red one |
| `message_template_components_update` | Meta edited the components | Refresh the cached component JSON — otherwise our `{{n}}` binding count goes stale and sends start failing |
| `template_category_update` | e.g. UTILITY reclassified to MARKETING | **Billing-relevant** — the same template silently costs more. Should notify. |

All four reinforce the invariant that **Meta-owned state is a cache** — we
already treat template status that way; the webhook is what keeps the cache
honest instead of stale.

### C3. Phone number health

| Field | Payload | Our handling |
|---|---|---|
| `phone_number_name_update` | display-name approval/rejection | Update `wa_phone_numbers.verified_name` |
| `phone_number_quality_update` | `GREEN`/`YELLOW`/`RED` + messaging limit tier change | Update `quality_rating`; **throttle or block broadcasts on RED**. The column already exists and defaults to `GREEN` — nothing currently ever changes it. |

### C4. Account level

| Field | Our handling |
|---|---|
| `account_update` | Bans, restrictions, ownership/partner changes, verified-name changes. Any restriction should immediately gate sending for that tenant. |
| `account_review_update` | WABA review `APPROVED`/`REJECTED` — drives onboarding state |
| `account_alerts` | Policy warnings ahead of enforcement — **the early-warning signal**; belongs on a tenant health dashboard |
| `business_capability_update` | Max daily conversations, max phone numbers — feeds quota display and pre-send capacity checks |
| `security` | 2FA changes, phone-number ownership events — audit log |

### C5. Compliance — `user_preferences`

Called out separately because it matters more than its size suggests.

Meta sends this when a user **stops or resumes marketing messages** from a
business. It is the platform-native opt-out, and it is authoritative.

Handling: on `stop`, set `contacts.opt_in_status = 'opted_out'`, stamp
`opt_out_at`, append a `consent_events` row with the webhook payload as
provenance (the `metadata JSONB` column in `20260805_contacts_module.sql` line
69 exists for exactly this), and — per D-031/D-032 — **treat it as terminal**.

This is the single highest-value non-`messages` field for us. Ignoring it means
continuing to send marketing to people who told Meta to stop, which is both a
policy violation and the fastest route to a quality-rating collapse.

### C6. Fields for future scope

| Field | What it is | When it matters |
|---|---|---|
| `flows` | WhatsApp Flows lifecycle + endpoint errors | When we build the flow/form builder. Flow *submissions* arrive as `interactive.nfm_reply` in `messages`, not here. |
| `calls` | WhatsApp Business Calling events | Voice module, if ever |
| `smb_message_echoes` | Copies of messages the tenant sent from the **WhatsApp Business App on a phone**, not through us | Important the moment a tenant uses both. Without it, our thread is missing half the conversation. |
| `history` | Chat history sync at onboarding | Would let a new tenant see past conversations on day one — strong onboarding feature |
| `message_echoes` | Echoes of API sends made by another client on the same number | Multi-tool tenants |
| `partner_solutions` | Solution-partner lifecycle | Only if we go down the partner route |
| `payment_configuration_update` | India payments config | Only if we enable WhatsApp Pay |
| `tracking_events` | Marketing Messages Lite delivery/engagement | If we adopt MM Lite |

**Recommendation:** subscribe to `messages`, the four template fields, the two
phone-number fields, the account fields, and `user_preferences` from day one —
they are cheap to receive and expensive to backfill. Log every field we are not
yet handling into `webhook_events` **unrouted** rather than dropping it, so
that when we build the consuming module the history is already there.

---

## Build log — work actually done against this plan

### ✅ Step 1 (B9) — Next 15 route typing (COMPLETE, 2026-08-06)

Fixes **D1** and **D2**. `npm run build` now succeeds for the whole app for the
first time.

**Root cause was not just the typing.** Each of the four inbox routes had
hand-rolled its *own* private `createSupabase()` helper — four copies of the
same 17 lines, all with `cookies()` unawaited. Meanwhile
`lib/supabase/server.ts` has exported a correct **async** `createClient()` all
along, and `lib/supabase/admin.ts` exports `createAdminClient()`. The send
route had additionally hand-rolled its own admin client too.

So the fix was to **delete the local copies and import the shared helpers**,
rather than patch four duplicates into correctness and leave the duplication in
place to drift again.

| File | Change |
|---|---|
| `app/api/inbox/conversations/route.ts` | Dropped local `createSupabase()`; `await createClient()` from `@/lib/supabase/server` |
| `app/api/inbox/conversations/[id]/route.ts` | Same, plus `params: Promise<{id}>` and `const { id } = await params` in both `GET` and `PATCH` |
| `app/api/inbox/conversations/[id]/messages/route.ts` | Same, plus awaited params in `GET` |
| `app/api/inbox/conversations/[id]/send/route.ts` | Same, plus dropped the local admin client in favour of `createAdminClient()` from `@/lib/supabase/admin`, plus awaited params in `POST` |

Net: **−68 lines of duplicated client-construction code**, three `import`
lines added.

**Verification**

```
npx tsc --noEmit   → 0 errors (was 27)
npm run build      → ✓ compiled, 45 routes emitted, 0 errors
```

**Behavioural note:** `lib/supabase/admin.ts` sets
`auth: { autoRefreshToken: false, persistSession: false }`, which the send
route's private admin client did not. That is the correct posture for a
service-role client and is a small improvement, not a regression — but it is a
behaviour change and is recorded here as one.

**Still not browser-tested.** The build compiles; no route has been exercised
against real data.

---

### ✅ Step 2 (B9) — Consent enforcement before send (COMPLETE, 2026-08-06)

Fixes **D6**, **D7**, **D8**. No schema change — the database already enforces
the hard rule; this closes the application-layer holes above it.

#### `app/api/meta/send-template/route.ts`

The route previously called Meta first and looked at the contact afterwards,
purely to write a log row. Restructured so the contact is resolved **before**
the Graph call:

| Defect | Before | After |
|---|---|---|
| **D7** | No opt-out check anywhere. An `opted_out` contact would be messaged. | Phone line → contact resolved up front; `opt_in_status === 'opted_out'` returns **403** `RECIPIENT_OPTED_OUT` before any network call. |
| **D6** | New contacts inserted with a hardcoded `opt_in_status: 'opted_in'` — the act of being messaged fabricated the record of consent, and because opt-in flips write a `contact_consent_events` row (D-104), it forged an audit entry too. | The field is simply not set. New contacts take the column default `unknown`; consent is only ever recorded through the real flow. |
| **D8** | The whole persistence block was one `try { … } catch { console.error }`. Two of its three steps didn't check their error at all, so a send could be logged nowhere and still return `success: true`. | Every sub-step `throw`s on error, and the response now carries `persisted`, `persistError`, `consentChecked`. |

Also: `source_type` changed `'broadcast'` → `'api'`. This route is the
super-admin validation dispatcher, not the Broadcast module; the old value
would have polluted any future per-channel attribution.

The consent lookup and the persistence block now share one resolution of
`phoneLine` / `contactUid`, so restructuring removed a duplicate query rather
than adding one.

#### `app/api/inbox/conversations/[id]/send/route.ts`

`opt_in_status` added to the contact embed (§2), and a 403 gate after the body
parse. Placed after parse deliberately — **internal notes are exempt**
(`body.type !== 'note'`), because a note is never delivered to the contact and
blocking one would just prevent an agent from recording *why* someone opted
out.

#### ⚠️ Deliberate trade-off — read this one

In `send-template`, if the Supabase admin client is unavailable (missing
`SUPABASE_SERVICE_ROLE_KEY`), the route **proceeds with the send** and returns
`consentChecked: false` rather than blocking.

Reasoning: this is the super-admin validation dispatcher, and hard-failing it on
a missing env var would be a behaviour regression that was not asked for. The
honest signal is in the response body instead.

**This posture is wrong for the Broadcast module.** When that is built, an
unavailable consent check must be a hard stop — a bulk send that silently skips
the opt-out check is exactly the failure Meta suspends accounts for. Recorded
here so it is not inherited by copy-paste.

#### What was already correct and needed nothing

`20260805_contacts_module.sql` already enforces the rule at the database level —
`trg_contacts_sticky_opt_out` raises on any attempt to move *off* `opted_out`,
and writes the `contact_consent_events` row itself. The application fixes above
are defence in depth and a better error message; they are not what makes
opt-out terminal.

**Verification**

```
npx tsc --noEmit   → 0 errors
npm run build      → ✓ compiled, 45 routes emitted, 0 errors
```

**Not runtime-tested.** No opted-out contact has been sent to in order to
observe the 403.

---

### ✅ Step 3 (B9) — Realtime migration (COMPLETE, 2026-08-06)

**New file:** `supabase/migrations/20260806_enable_realtime_inbox.sql`.
`20260804_inbox_conversations_messages.sql` is applied and therefore immutable —
its two commented-out `ALTER PUBLICATION` lines (251–252) are re-issued here
instead of being uncommented in place.

Fixes **D3**. Contents:

1. **Publication adds** — `public.conversations` and `public.messages` into
   `supabase_realtime`. `ALTER PUBLICATION … ADD TABLE` has no `IF NOT EXISTS`
   form and errors `42710` on a duplicate, so each is wrapped in a
   `pg_publication_tables` guard. Safe to re-run.
2. **`REPLICA IDENTITY FULL` on `messages`** — not cosmetic. The inbox's UPDATE
   handler replaces the whole row in React state from `payload.new`. Under the
   default replica identity that payload carries only the primary key, so a
   status update would blank the message body while updating the tick. Since the
   status webhook (step 6) is precisely what will drive those UPDATEs, `FULL` is
   a prerequisite for the tick feature, not an optimisation.
3. **`REPLICA IDENTITY FULL` on `conversations`** — weaker justification; the
   list is refetched rather than patched. Applied for consistency and
   predictable RLS filtering of realtime rows.
4. Verification `SELECT`s at the end (expect `relreplident = 'f'` for both).

**Security posture unchanged.** Realtime honours RLS for `authenticated`
subscribers, and both tables already carry tenant-isolation policies from
`20260804`. `provider_secrets` is deliberately **not** published.

**⚠️ NOT YET APPLIED.** This file has been written but not run against the live
database. Until it is executed in the Supabase SQL Editor, the inbox's three
subscriptions continue to connect successfully and receive nothing.

---

## Open questions for you

1. **The n8n cutover.** Every phone line currently webhooks to
   `n8n.ibloomsolutions.com`. What does that flow do today, and is taking the
   traffic away from it safe? — *still open, and it now gates step 5.*
2. **Scope of the first pass.** Do you want Part B steps 1–7 (loop closes,
   ticks work, no attachments), or 1–8 including media? — *still open.*
3. ~~**Steps 1–3 are fixes, not features.** Want me to do those now,
   independently of approving the rest?~~ — **Answered: yes.** Steps 1, 2 and 3
   are done.

## Track record

Appended to this doc as work proceeds, and cross-referenced from
`docs/contacts-build-log.md`.

**Done:** Step 1 (Next 15 route typing), Step 2 (consent enforcement),
Step 3 (Realtime migration — file written, **not yet applied to the DB**).

**Next:** Step 4 (`20260806_webhook_events.sql`) then Step 5 (webhook skeleton),
which is blocked on open question 1.

