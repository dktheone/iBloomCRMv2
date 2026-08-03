/**
 * iBloomCRM v2 — Centralized Platform & Master Agency Configuration
 * 
 * STRICT INVARIANT RULE:
 * ALL PLATFORM CONSTANTS MUST BE READ FROM THIS MODULE, WHICH SOURCES FROM .env.local.
 */

export const PLATFORM_CONFIG = {
  // Meta Tech Provider App Specs & Versioning
  metaApiVersion: process.env.NEXT_PUBLIC_META_API_VERSION || 'v25.0',
  metaAppId: process.env.NEXT_PUBLIC_META_APP_ID || '',
  // SECURITY: App Secret is a server-only secret and must NEVER be exposed via a
  // NEXT_PUBLIC_ variable (those are inlined into the client bundle). Source it
  // from a server-only env var and never hardcode a fallback value.
  metaAppSecret: process.env.META_APP_SECRET || '',
  metaAppName: process.env.NEXT_PUBLIC_META_APP_NAME || 'ibloom_connect',
  metaBusinessPortfolioId: process.env.NEXT_PUBLIC_META_BUSINESS_PORTFOLIO_ID || '',
  appMode: (process.env.NEXT_PUBLIC_META_APP_MODE || 'dev') as 'live' | 'dev',
  
  // Permanent System User / WhatsApp Access Token
  systemUserAccessToken: process.env.NEXT_META_WHATSAPP_ACCESS_TOKEN || '',
  webhookCallbackUrl: process.env.NEXT_PUBLIC_WEBHOOK_URL || '',
  // SECURITY: Webhook verify token is a shared secret — never hardcode a fallback.
  webhookVerifyToken: process.env.NEXT_META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || '',

  // Master Agency & Tenant Zero Invariants
  tenantZeroId: process.env.NEXT_PUBLIC_TENANT_ZERO_ID || '00000000-0000-0000-0000-000000000000',
  masterAgencyName: process.env.NEXT_PUBLIC_MASTER_AGENCY_NAME || 'iBloom Master Agency (Tenant Zero)',
  masterAgencySlug: process.env.NEXT_PUBLIC_MASTER_AGENCY_SLUG || 'ibloom-master',

  // Super Admin Identity Invariants
  superAdminId: process.env.NEXT_PUBLIC_SUPER_ADMIN_ID || '11111111-1111-1111-1111-111111111111',
  superAdminEmail: process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'crm@ibloomsolutions.com',
  superAdminName: process.env.NEXT_PUBLIC_SUPER_ADMIN_NAME || 'Master Super Admin',
  // SECURITY: never hardcode a default admin password.
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || '',
};
