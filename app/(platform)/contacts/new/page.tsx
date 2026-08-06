// app/(platform)/contacts/new/page.tsx
// Manual contact creation form (D-032, D-034)

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ContactForm from '@/components/contacts/ContactForm';

export default async function NewContactPage() {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get tenant from user_tenants
  const { data: userTenant } = await supabase
    .from('user_tenants')
    .select('tenant_uid')
    .eq('user_uid', user.id)
    .single();

  if (!userTenant) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-[#0F1419] dark:via-[#1A2232] dark:to-[#0F1419] p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Create New Contact
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Add a contact manually. WhatsApp phone is required.
          </p>
        </div>

        <ContactForm tenantUid={userTenant.tenant_uid} mode="create" />
      </div>
    </div>
  );
}
