# Webhook Investigation & Supabase Reconnection Roadmap (Saved for Production)

> **Document Status:** SAVED ARCHITECTURAL ROADMAP  
> **Phase 1 (Active Testing):** Local Filesystem JSON Logger (`data/webhook_raw_logs.json`)  
> **Phase 2 (Production Re-enablement):** Supabase `webhook_events` Database Synchronization & Meta WABA Subscription  

---

## 1. Multi-Level Pipeline Architecture Recap

```
[Level 1: Network / DNS / Nginx] 
        ↓ 
[Level 2: Next.js API Route / PM2] 
        ↓ 
[Level 3: Supabase Service Role & Database Insert] (Deferred to Phase 2)
        ↓ 
[Level 4: CRM Webhook UI Table & Realtime Push] 
        ↓ 
[Level 5: Meta Developer Webhook & WABA Configuration]
```

- **Level 1 (Network / Nginx):** Verified active. Nginx proxies `https://connect.ibloomsolutions.com/api/webhooks/meta` to Next.js port 3000 over SSL cleanly.
- **Level 2 (Next.js):** Route handler `app/api/webhooks/[provider]/route.ts` is live and reachable.
- **Level 3 (Supabase):** Temporarily bypassed during Phase 1 testing to prevent RLS/key blocking. Documented below for Phase 2 re-connection.
- **Level 4 (Dashboard):** Reads from local JSON log file in Phase 1, then reconnects to Supabase queries and Realtime in Phase 2.
- **Level 5 (Meta):** Requires WABA object subscription and `subscribed_apps` link.

---

## 2. Phase 2 Roadmap: Supabase Database Re-connection Steps

Once raw webhook capture is verified in `data/webhook_raw_logs.json`, follow these exact steps to re-enable Supabase database logging:

### Step 2.1: Verify `SUPABASE_SERVICE_ROLE_KEY` on AWS Server
1. In Supabase Dashboard:
   - Go to **Project Settings** $\rightarrow$ **API** $\rightarrow$ **Project API keys**.
   - Copy the **`service_role` (secret)** key (do **NOT** use the anon public key).
2. On AWS Server (`ubuntu@ip-172-26-9-252`):
   - Edit `/home/ubuntu/apps/iBloomCRMv2/.env.local`:
     ```env
     SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... (your secret service_role key)
     ```
3. Verify RLS Policy on `webhook_events`:
   - Ensure the policy in migration `20260806_webhook_events.sql` is active:
     ```sql
     CREATE POLICY "Service role full access on webhook_events" 
         ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);
     ```

### Step 2.2: Re-enable Synchronous Supabase Sync in Webhook Route
1. In `app/api/webhooks/[provider]/route.ts`:
   - Set `ENABLE_SUPABASE_SYNC = true`.
   - Incoming payloads will write to both `data/webhook_raw_logs.json` (audit backup) and `public.webhook_events` (persistent database).
2. The Team Inbox loop will read from `public.webhook_events` to update message delivery ticks (`sent` → `delivered` → `read`) in real time.

---

## 3. Phase 2 Roadmap: Meta WABA Webhook & Subscribed Apps Activation

### Step 3.1: Meta Developer Portal WABA Object Subscription
1. In [Meta Developer Portal](https://developers.facebook.com/):
   - Navigate to your App (`ibloom_connect` / ID: `794921202917198`).
   - In the left sidebar under **Products**, click **WhatsApp** $\rightarrow$ **Configuration** (OR under Webhooks, select **WhatsApp Business Account** from the top dropdown).
   - Verify Callback URL is set to: `https://connect.ibloomsolutions.com/api/webhooks/meta`
   - Verify Token: `ibloom_webhook_secret_verify_2026`
   - In Webhook fields, subscribe to:
     - `messages`
     - `message_template_status_update`
     - `phone_number_quality_update`

### Step 3.2: Execute WABA Subscribed Apps Link API
1. Run the dedicated binding route:
   ```bash
   curl -X POST https://connect.ibloomsolutions.com/api/meta/subscribe-waba \
     -H "Cookie: <your-superadmin-session-cookie>"
   ```
   This calls Meta Graph API:
   `POST https://graph.facebook.com/v25.0/{meta_waba_id}/subscribed_apps`
   using your System User Access Token to bind the WABA to your server for live customer messaging.

### Step 3.3: Meta App Development Mode Restrictions
1. If the Meta App is in **Development Mode**:
   - Meta drops messages from external numbers not registered in **App Roles**.
   - Go to **App Roles** $\rightarrow$ **Roles** $\rightarrow$ add your personal testing WhatsApp phone number as a **Tester**.
   - When launching to production, switch App Mode from **Development** to **Live**.
