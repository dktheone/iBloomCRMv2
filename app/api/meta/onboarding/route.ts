import { NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { 
  resolveMetaBusinessPortfolio, 
  discoverBusinessWabaAccounts, 
  discoverWabaPhoneNumbers, 
  persistEnrolledOnboardingAssets 
} from '@/lib/meta/graph-client';

export async function GET(request: Request) {
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
        return apiError('business_id is required for step 2', 400);
      }
      const res = await discoverBusinessWabaAccounts(businessId);
      return NextResponse.json(res);
    } 
    
    if (step === '3') {
      if (!wabaId) {
        return apiError('waba_id is required for step 3', 400);
      }
      const res = await discoverWabaPhoneNumbers(wabaId);
      return NextResponse.json(res);
    }

    return apiError('Invalid onboarding step', 400);
  } catch (error: any) {
    return apiError(error?.message || 'Error during onboarding step');
  }
}

export async function POST(request: Request) {
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
      return apiError('Missing required onboarding payload parameters', 400);
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
      return apiSuccess({
        message: `Successfully enrolled ${wabas.length} WABA(s) and ${phoneNumbers.length} phone line(s) into Master Agency DB!`,
      });
    }

    return apiError(res.error || 'Failed to save enrolled assets.');
  } catch (error: any) {
    return apiError(error?.message || 'Error persisting onboarding assets.');
  }
}
