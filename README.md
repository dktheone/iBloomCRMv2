# iBloomCRM v2

iBloomCRM is an enterprise-grade, multi-tenant WhatsApp Business API (WABA) CRM & Marketing Automation SaaS platform built for agencies and business operations.

---

## 🚀 Key Features & Modules

### 🏢 Asset Hub & WABA Auto-Provisioning (`/assets`)
- **Multi-WABA Management**: Connect, enroll, and manage multiple Meta WhatsApp Business Accounts.
- **3-Stage Asset Lifecycle Engine**:
  - `PROVISIONED`: Staged line registered in DB.
  - `LOCKED`: Verified & locked operational line.
  - `LIVE_OPERATIONAL`: Fully active line for campaigns and broadcasts.
  - `UNLOCKED_STANDBY`: Safely detached or standby line.
- **Meta Status Drift Detection**: Real-time detection of display name status changes, quality drops, and messaging tier changes.
- **IANA Timezone Normalizer**: Converts Meta numeric timezone codes (e.g. `71` -> `Asia/Kolkata`) automatically for DB consistency.

### 📋 Template Hub & Builder (`/templates` & `/templates/builder`)
- **Visual Template Builder**: Create, edit, clone, and manage WhatsApp templates across WABAs.
- **Component Support**: Headers (Text, Image, Video, Document), Body text, Footers, Quick Replies, Call-to-Action URLs, and Phone buttons.
- **Live WhatsApp Simulator**: Preview exact message appearance with real-time markdown formatting (`*bold*`, `_italic_`, `~strike~`).

### ⚡ Validation & Live Broadcast Sandbox (`/validation`)
- **Operational Line Filtering**: Strict filtering to display only locked/operational phone lines with hover metadata tooltips (`z-[9999]`).
- **WABA-Aware Template Sync**: Auto-loads templates corresponding to the selected line's WABA.
- **Flexible Variable Support**: Automatic parameter detection for both numeric (`{{1}}`, `{{2}}`) and named (`{{customer_name}}`, `{{otp}}`) variables.
- **Real-Time Meta API Dispatch**: Dispatches live test payloads to WhatsApp recipient numbers (default: `+919532358574`) via `/api/meta/send-template`.
- **Live Event Stream Log**: Detailed delivery logging with `wamid`, status badges, error tracebacks, and collapsible raw Meta response.

### 🛡️ Security & Zero-Recursion RLS Engine
- **Non-Recursive RLS**: PostgreSQL `SECURITY DEFINER` helper functions (`public.is_super_admin()`) bypass RLS self-referencing to eliminate infinite recursion loops on `public.users`.
- **Primary Key Standard**: Unified `_uid` column naming (`user_uid`, `tenant_uid`, `waba_uid`, `phone_line_uid`, `template_uid`).
- **Disk Audit Logger**: Low-latency, zero-cost JSONL file-based audit engine (`storage/logs/audit/`) for tracking all asset enrollments and template mutations.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling & UI**: Vanilla Tailwind CSS, Lucide React, Iconify
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security, GoTrue Auth)
- **Integrations**: Meta Graph API (v18.0/v19.0/v20.0)

---

## ⚙️ Prerequisites

- **Node.js**: v18.x or newer
- **Supabase Account**: Project configured with RLS and PostgreSQL functions
- **Meta Developer Account**: WhatsApp Business API App with System User Access Token

---

## 🛠️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/ibloom-crm.git
   cd ibloom-crm
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env.local` and populate required keys:
   ```bash
   cp .env.example .env.local
   ```
   *Key variables:*
   - `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anonymous Key
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Secret
   - `META_SYSTEM_USER_ACCESS_TOKEN`: Meta Graph API Token

4. **Database Reset & Migrations:**
   Run `supabase/migrations/20260802_complete_clean_reset.sql` in your Supabase SQL Editor.

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```

6. **Verify Production Build:**
   ```bash
   npm run build
   ```

---

## 📁 Project Structure

- `/app/(platform)` - Core platform routes (`/assets`, `/templates`, `/validation`, `/dashboard`)
- `/app/api/meta` - Meta Graph API serverless integration routes
- `/components` - Shared UI layout components & providers
- `/lib/meta` - Graph API client, eligibility rulebook, asset lifecycle engine, status drift checker
- `/lib/security` - Disk-based JSONL audit logging engine
- `/supabase/migrations` - Complete clean database migration scripts

---

## 📄 License

Copyright (c) 2026 iBloom Solutions. All Rights Reserved.
Proprietary & Confidential.
