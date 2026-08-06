// app/(platform)/contacts/[id]/page.tsx
// Contact Detail Page — three-panel layout (D-105, D-106, D-110)

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getContactDetail, getConsentHistory, getCustomFieldDefs } from '@/lib/contacts/queries';
import ContactCard from '@/components/contacts/ContactCard';
import ActivityTimeline from '@/components/contacts/ActivityTimeline';
import ContactSidebar from '@/components/contacts/ContactSidebar';
import ConsentPanel from '@/components/contacts/ConsentPanel';

interface ContactDetailPageProps {
  // Next.js 15: params is a Promise
  params: Promise<{ id: string }>;
}

export default async function ContactDetailPage({ params }: ContactDetailPageProps) {
  const { id: contactUid } = await params;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  // Get tenant from user_tenants
  const { data: userTenant } = await supabase
    .from('user_tenants')
    .select('tenant_uid')
    .eq('user_uid', user.id)
    .single();

  if (!userTenant) {
    notFound();
  }

  const tenantUid = userTenant.tenant_uid;

  // Fetch contact with all related data
  try {
    const [contact, consentHistory, customFieldDefs] = await Promise.all([
      getContactDetail(contactUid, tenantUid),
      getConsentHistory(contactUid, tenantUid),
      getCustomFieldDefs(tenantUid, 'contact'),
    ]);

    if (!contact) {
      notFound();
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>Platform</span>
              <span>→</span>
              <a href="/contacts" className="text-cyan-600 dark:text-cyan-400 hover:underline">
                Contacts
              </a>
              <span>→</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-semibold">
                {contact.name || 'Unnamed Contact'}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Contact Details
            </h1>
          </div>
        </div>

        {/* Three-panel layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Contact Card */}
          <div className="lg:col-span-3">
            <ContactCard contact={contact} />
          </div>

          {/* Center: Activity Timeline */}
          <div className="lg:col-span-6">
            <ActivityTimeline
              activities={contact.activity || []}
              contactUid={contact.contact_uid}
              tenantUid={tenantUid}
            />
          </div>

          {/* Right: Labels, Custom Fields, Addresses, Consent */}
          <div className="lg:col-span-3 space-y-6">
            <ContactSidebar
              contact={contact}
              customFieldDefs={customFieldDefs}
              tenantUid={tenantUid}
            />

            <ConsentPanel
              contact={contact}
              consentHistory={consentHistory}
              tenantUid={tenantUid}
            />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Error loading contact detail:', error);
    notFound();
  }
}
