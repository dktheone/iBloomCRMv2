# iBloomCRM

iBloomCRM is a next-generation, multi-tenant WhatsApp/Meta CRM SaaS platform. It is designed to provide seamless WhatsApp Business API integrations, automated flows, team inbox management, and broadcast capabilities for marketing agencies and their clients.

## 🚀 Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS
- **Backend & Auth:** Supabase (PostgreSQL, GoTrue Auth, Realtime)
- **Deployment:** AWS Lightsail / Vercel

## ⚙️ Prerequisites

Before you begin, ensure you have met the following requirements:
- You have installed [Node.js](https://nodejs.org/) (v18.x or newer).
- You have a [Supabase](https://supabase.com/) account and project set up.
- You have a Meta Developer account with a WhatsApp Business API app configured.

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
   Copy the example environment file and fill in your credentials.
   ```bash
   cp .env.example .env.local
   ```
   *Required variables:*
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase public anonymous key.
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase secret service role key.
   - Meta Webhook tokens and secrets.

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```

5. **View the Application:**
   Open [http://localhost:3000](http://localhost:3000) in your browser to see the CRM in action.

## 🗄️ Project Structure

- `/app` - Next.js App Router pages and API routes.
- `/components` - Reusable React components (UI, layouts, forms).
- `/lib` - Utility functions, Supabase client initialization, and helpers.
- `/hooks` - Custom React hooks for state and data fetching.
- `/supabase` - Supabase migrations, types, and database functions.
- `/config` - Core configuration files.
- `/data` - Static app data and constants.

## 🔒 Security & Roles

iBloomCRM is built with strict Row Level Security (RLS) on Supabase.
- **Tenant Isolation:** Data is strictly siloed per tenant.
- **Platform vs. Tenant Roles:** Supports internal platform administrators, tenant owners, and tenant staff with granular permissions.

## 📄 License

Copyright (c) 2026 iBloom Solutions. All Rights Reserved.
This project is proprietary and confidential.
