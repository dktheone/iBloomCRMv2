import type { SupabaseClient } from '@supabase/supabase-js';
import { PLATFORM_CONFIG } from '@/config/platform.config';

export type TenantIdColumn = 'id' | 'tenant_uid' | 'auto';

/**
 * Loads the Master Agency (Tenant Zero) row from public.tenants.
 */
export async function fetchMasterTenant(
  client: SupabaseClient,
  columns: string = 'tenant_uid, id'
): Promise<Record<string, any> | null> {
  const { data } = await client
    .from('tenants')
    .select(columns)
    .eq('is_master_agency', true)
    .limit(1);

  return data && data.length > 0 ? (data[0] as Record<string, any>) : null;
}

/**
 * Resolves the Master Agency tenant identifier, falling back to the configured
 * Tenant Zero id when the agency has not been provisioned yet.
 */
export async function resolveMasterTenantId(
  client: SupabaseClient,
  idColumn: TenantIdColumn = 'auto',
  fallback: string = PLATFORM_CONFIG.tenantZeroId
): Promise<string> {
  const columns = idColumn === 'auto' ? 'tenant_uid, id' : idColumn;
  const tenant = await fetchMasterTenant(client, columns);

  if (!tenant) return fallback;

  if (idColumn === 'auto') {
    return tenant.tenant_uid || tenant.id || fallback;
  }

  return tenant[idColumn] || fallback;
}
