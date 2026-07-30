import { createClient } from '@/lib/supabase/server';

export default async function Page() {
  const supabase = await createClient();

  const { data: tenants } = await supabase.from('tenants').select('*');

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">iBloomCRM Database Verification</h1>
      <pre className="p-4 bg-slate-900 text-cyan-400 rounded-xl font-mono text-xs overflow-x-auto">
        {JSON.stringify(tenants, null, 2)}
      </pre>
    </div>
  );
}