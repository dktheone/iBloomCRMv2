import { NextResponse } from 'next/server';
import { 
  resolveMetaBusinessPortfolio, 
  discoverBusinessWabaAccounts, 
  discoverWabaPhoneNumbers, 
  persistEnrolledOnboardingAssets 
} from '@/lib/meta/graph-client';
import { allowBootstrapOrRequireUser } from '@/lib/auth/guard';

export async function GET(request: Request) {
  const gate = await allowBootstrapOrRequireUser();
  if (gate.response) return gate.response;

  const { searchParams } = new URL(request.url);
  const step = searchParams.get('step') || '1';
  const businessId = searchParams.get('business_id');
  const wabaId = searchParams.get('waba_id');

  try {
    if (step === '1') {
      const res = await resolveMetaBusinessPortfolio();
      return NextResponse.json(res);
    } 
    
    if (step === '2') {
      if (!businessId) {
        return NextResponse.json({ success: false, error: 'business_id is required for step 2' }, { status: 400 });
      }
      const res = await discoverBusinessWabaAccounts(businessId);
      return NextResponse.json(res);
    } 
    
    if (step === '3') {
      if (!wabaId) {
        return NextResponse.json({ success: false, error: 'waba_id is required for step 3' }, { status: 400 });
      }
      const res = await discoverWabaPhoneNumbers(wabaId);
      return NextResponse.json(res);
    }

    return NextResponse.json({ success: false, error: 'Invalid onboarding step' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Error during onboarding step' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await allowBootstrapOrRequireUser();
  if (gate.response) return gate.response;

  try {
    const body = await request.json();
    const { 
      masterAgencyName,
      superAdminName,
      superAdminEmail,
      superAdminPhone,
      password,
      business_id, 
      wabas, 
      phoneNumbers 
    } = body;

    if (!business_id || !wabas || !phoneNumbers) {
      return NextResponse.json({ success: false, error: 'Missing required onboarding payload parameters' }, { status: 400 });
    }

    const res = await persistEnrolledOnboardingAssets({ 
      masterAgencyName,
      superAdminName,
      superAdminEmail,
      superAdminPhone,
      password,
      business_id, 
      wabas, 
      phoneNumbers 
    });

    if (res.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully enrolled ${wabas.length} WABA(s) and ${phoneNumbers.length} phone line(s) into Master Agency DB!`,
      });
    }

    return NextResponse.json({ success: false, error: res.error || 'Failed to save enrolled assets.' }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Error persisting onboarding assets.' }, { status: 500 });
  }
}
