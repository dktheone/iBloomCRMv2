import { createAdminClient } from '@/lib/supabase/admin';
import { fetchMetaWabaAssets } from '@/lib/meta/graph-client';
import { evaluatePhoneLineEligibility } from '@/lib/meta/eligibility-rulebook';
import { apiError, apiException, apiSuccess } from '@/lib/api/response';
import { resolveMetaPhoneId, resolveMetaWabaId } from '@/lib/meta/asset-normalizers';

export async function GET() {
  try {
    const supabaseAdmin = createAdminClient();

    // 1. Fetch enrolled WABAs and Phone Lines from Supabase DB
    const { data: dbWabas } = await supabaseAdmin.from('wabas').select('meta_waba_id, waba_uid');
    const { data: dbPhones } = await supabaseAdmin.from('wa_phone_numbers').select('meta_phone_number_id, phone_line_uid');

    const enrolledWabaIds = new Set((dbWabas || []).map(resolveMetaWabaId));
    const enrolledPhoneIds = new Set((dbPhones || []).map(resolveMetaPhoneId));

    // 2. Fetch live assets from Meta Graph API
    const liveMetaAssets = await fetchMetaWabaAssets();

    if (!liveMetaAssets.success) {
      return apiError(liveMetaAssets.error || 'Failed to fetch live Meta assets.', 200, {
        unregisteredWabas: [],
        unregisteredPhones: [],
      });
    }

    // 3. Filter out assets already enrolled in DB
    const unregisteredWabas = liveMetaAssets.wabas.filter((w) => !enrolledWabaIds.has(w.waba_id));

    const unregisteredPhones = liveMetaAssets.phoneNumbers
      .filter((p) => !enrolledPhoneIds.has(p.id))
      .map((p) => {
        const eligibility = evaluatePhoneLineEligibility({
          phone_number_id: p.id,
          waba_id: p.waba_id,
          display_phone_number: p.display_phone_number,
          verified_name: p.verified_name,
          quality_rating: p.quality_rating,
          code_verification_status: p.code_verification_status,
          messaging_limit_tier: p.messaging_limit_tier,
          name_status: p.name_status,
          is_test_number: p.is_test_number,
        });

        return {
          ...p,
          eligibility,
        };
      });

    return apiSuccess({
      unregisteredWabaCount: unregisteredWabas.length,
      unregisteredPhoneCount: unregisteredPhones.length,
      unregisteredWabas,
      unregisteredPhones,
      totalLiveWabas: liveMetaAssets.wabas.length,
      totalLivePhones: liveMetaAssets.phoneNumbers.length,
    });
  } catch (err: any) {
    return apiException(err, 'Error checking unregistered assets');
  }
}
