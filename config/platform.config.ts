/**
 * iBloomCRM v2 — Centralized Platform & Master Agency Configuration
 * 
 * STRICT INVARIANT RULE:
 * ALL PLATFORM CONSTANTS MUST BE READ FROM THIS MODULE, WHICH SOURCES FROM .env.local.
 */

export const PLATFORM_CONFIG = {
  // Meta Tech Provider App Specs & Versioning
  metaApiVersion: process.env.NEXT_PUBLIC_META_API_VERSION || 'v25.0',
  metaAppId: process.env.NEXT_PUBLIC_META_APP_ID || '794921202917198',
  metaAppSecret: process.env.NEXT_PUBLIC_META_APP_SECRET || '79a77d445a3b4e9bd7bbcb1417fea39a',
  metaAppName: process.env.NEXT_PUBLIC_META_APP_NAME || 'ibloom_connect',
  metaBusinessPortfolioId: process.env.NEXT_PUBLIC_META_BUSINESS_PORTFOLIO_ID || '1304712777970662',
  appMode: (process.env.NEXT_PUBLIC_META_APP_MODE || 'dev') as 'live' | 'dev',
  
  // Permanent System User / WhatsApp Access Token
  systemUserAccessToken: process.env.NEXT_META_WHATSAPP_ACCESS_TOKEN || '',
  webhookCallbackUrl: process.env.NEXT_PUBLIC_WEBHOOK_URL || 'https://api.ibloom.connect/api/webhooks/meta',
  webhookVerifyToken: process.env.NEXT_META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || 'ibloom-secret-8822',

  // Master Agency & Tenant Zero Invariants
  tenantZeroId: process.env.NEXT_PUBLIC_TENANT_ZERO_ID || '00000000-0000-0000-0000-000000000000',
  masterAgencyName: process.env.NEXT_PUBLIC_MASTER_AGENCY_NAME || 'iBloom Master Agency (Tenant Zero)',
  masterAgencySlug: process.env.NEXT_PUBLIC_MASTER_AGENCY_SLUG || 'ibloom-master',

  // Super Admin Identity Invariants
  superAdminId: process.env.NEXT_PUBLIC_SUPER_ADMIN_ID || '11111111-1111-1111-1111-111111111111',
  superAdminEmail: process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'crm@ibloomsolutions.com',
  superAdminName: process.env.NEXT_PUBLIC_SUPER_ADMIN_NAME || 'Master Super Admin',
  superAdminPassword: process.env.NEXT_PUBLIC_SUPER_ADMIN_PASSWORD || 'ChangeMe123!',
};
