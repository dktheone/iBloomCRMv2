import { createAdminClient } from '@/lib/supabase/admin';

export async function logValidationFailure({
  formSurface,
  rejectedField,
  failureReason,
  ipAddress,
  userAgent,
}: {
  formSurface: string;
  rejectedField: string;
  failureReason: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin.from('validation_audit_logs').insert({
      form_surface: formSurface,
      rejected_field: rejectedField,
      failure_reason: failureReason,
      ip_address: ipAddress || '127.0.0.1',
      user_agent: userAgent || 'Unknown Browser',
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[Validation Audit Logger] Failed to persist validation failure:', error.message);
    }
  } catch (err) {
    console.error('[Validation Audit Logger] Exception writing validation failure:', err);
  }
}
