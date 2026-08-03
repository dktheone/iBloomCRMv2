import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discoverBusinessWabaAccounts,
  discoverWabaPhoneNumbers,
  fetchWabaHealthStatus,
  fetchWabaMessageTemplates,
  getWhatsappBusinessProfile,
  resolveMetaBusinessPortfolio,
  testMetaAppConnection,
  updateWhatsappBusinessProfile,
} from '@/lib/meta/graph-client';

vi.mock('@/lib/meta/logger', () => ({ logMetaGraphApiCall: vi.fn() }));

const TOKEN = 'EAAsystemusertoken';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

const respondWith = (...bodies: unknown[]) => {
  for (const body of bodies) fetchMock.mockResolvedValueOnce(jsonResponse(body));
};

const requestedUrls = () => fetchMock.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('testMetaAppConnection', () => {
  it('reports a missing system user token without calling Meta', async () => {
    const result = await testMetaAppConnection();

    expect(result).toMatchObject({ success: false, tokenValid: false, expiresAt: 'Never' });
    expect(result.error).toContain('NEXT_META_WHATSAPP_ACCESS_TOKEN is missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a successful connection for a valid app lookup', async () => {
    respondWith({ id: '999', name: 'ibloom_connect_live' });

    const result = await testMetaAppConnection(TOKEN);

    expect(result).toMatchObject({
      success: true,
      metaAppId: '999',
      appName: 'ibloom_connect_live',
      tokenValid: true,
      expiresAt: 'Never (Permanent System User Token)',
    });
    expect(result.scopes).toContain('whatsapp_business_management');
  });

  it('falls back to debug_token when the app lookup fails and reports permanent tokens', async () => {
    respondWith(
      { error: { code: 100, message: 'Unsupported get request' } },
      { data: { is_valid: true, app_id: '794921202917198', application: 'ibloom_connect', scopes: ['whatsapp_business_management'], expires_at: 0 } }
    );

    const result = await testMetaAppConnection(TOKEN);

    expect(result).toMatchObject({
      success: true,
      tokenValid: true,
      appName: 'ibloom_connect',
      expiresAt: 'Never (Permanent System User Token)',
      errorCode200Detected: false,
    });
    expect(requestedUrls()[1]).toContain('/debug_token?input_token=');
  });

  it('surfaces the Error Code 200 business asset permission hint', async () => {
    respondWith({ error: { code: 200, message: 'Permissions error' } }, { error: { code: 200, message: 'Permissions error' } });

    const result = await testMetaAppConnection(TOKEN);

    expect(result).toMatchObject({ success: false, tokenValid: false, errorCode200Detected: true });
    expect(result.error).toContain('Meta Error Code 200');
  });

  it('reports an invalid token when both the app lookup and debug_token fail', async () => {
    respondWith({ error: { code: 190, message: 'Invalid OAuth access token' } }, { error: { code: 190, message: 'Invalid OAuth access token' } });

    const result = await testMetaAppConnection(TOKEN);

    expect(result).toMatchObject({ success: false, tokenValid: false, expiresAt: 'Invalid', errorCode200Detected: false });
    expect(result.error).toBe('Invalid OAuth access token');
  });

  it('converts a finite token expiry into a readable timestamp', async () => {
    respondWith({ error: { code: 100 } }, { data: { is_valid: true, expires_at: 1_767_225_600 } });

    const result = await testMetaAppConnection(TOKEN);

    expect(result.expiresAt).not.toBe('Never (Permanent System User Token)');
    expect(new Date(result.expiresAt).toString()).not.toBe('Invalid Date');
  });

  it('captures network exceptions', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    expect(await testMetaAppConnection(TOKEN)).toMatchObject({ success: false, expiresAt: 'Error', error: 'ETIMEDOUT' });
  });
});

describe('resolveMetaBusinessPortfolio', () => {
  it('requires a system user token', async () => {
    const result = await resolveMetaBusinessPortfolio();

    expect(result.success).toBe(false);
    expect(result.error).toContain('NEXT_META_WHATSAPP_ACCESS_TOKEN is missing');
  });

  it('resolves the configured portfolio with token scopes', async () => {
    respondWith(
      { data: { scopes: ['business_management'], expires_at: 0 } },
      { id: 'biz_1', name: 'iBloom Portfolio', verification_status: 'VERIFIED' }
    );

    const result = await resolveMetaBusinessPortfolio(TOKEN);

    expect(result).toMatchObject({
      success: true,
      scopes: ['business_management'],
      expiresAt: 'Never (Permanent System User Token)',
      portfolio: { business_id: 'biz_1', name: 'iBloom Portfolio', verification_status: 'VERIFIED' },
    });
  });

  it('falls back to configured portfolio defaults when Meta omits fields', async () => {
    respondWith({}, {});

    const result = await resolveMetaBusinessPortfolio(TOKEN);

    expect(result.portfolio).toMatchObject({
      business_id: '1304712777970662',
      name: 'iBloom Master Business Portfolio',
      verification_status: 'VERIFIED',
    });
  });

  it('reports the Error Code 200 asset access failure', async () => {
    respondWith({ data: { expires_at: 0 } }, { error: { code: 200, message: 'Permissions error' } });

    const result = await resolveMetaBusinessPortfolio(TOKEN);

    expect(result).toMatchObject({ success: false, errorCode200Detected: true });
    expect(result.error).toContain('lacks Business Asset Access permission');
  });

  it('captures network exceptions', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

    expect(await resolveMetaBusinessPortfolio(TOKEN)).toMatchObject({ success: false, expiresAt: 'Error', error: 'socket hang up' });
  });
});

describe('discoverBusinessWabaAccounts', () => {
  it('requires a system user token', async () => {
    expect(await discoverBusinessWabaAccounts('biz_1')).toEqual({ success: false, wabas: [], error: 'Access token missing' });
  });

  it('maps owned WABAs and normalizes the Meta timezone code', async () => {
    respondWith({ data: [{ id: 'waba_1', name: 'iBloom WABA', currency: 'INR', timezone_id: '71', account_review_status: 'APPROVED' }] });

    const result = await discoverBusinessWabaAccounts('biz_1', TOKEN);

    expect(result.success).toBe(true);
    expect(result.wabas).toEqual([
      {
        waba_id: 'waba_1',
        name: 'iBloom WABA',
        currency: 'INR',
        timezone_id: 'Asia/Kolkata',
        account_review_status: 'APPROVED',
        message_template_namespace: 'ibloom_template_ns_99',
        business_id: 'biz_1',
        business_verification_status: 'VERIFIED',
      },
    ]);
    expect(requestedUrls()[0]).toContain('/biz_1/owned_whatsapp_business_accounts');
  });

  it('falls back to /me/whatsapp_business_accounts when the portfolio owns none', async () => {
    respondWith({ data: [] }, { data: [{ id: 'waba_2' }] });

    const result = await discoverBusinessWabaAccounts('biz_1', TOKEN);

    expect(requestedUrls()[1]).toContain('/me/whatsapp_business_accounts');
    expect(result.wabas[0]).toMatchObject({ waba_id: 'waba_2', name: 'WABA waba_2', currency: 'USD' });
  });

  it('returns the sandbox fallback WABA when discovery is empty', async () => {
    respondWith({ data: [] }, { data: [] });

    const result = await discoverBusinessWabaAccounts('', TOKEN);

    expect(result.wabas).toHaveLength(1);
    expect(result.wabas[0]).toMatchObject({ waba_id: '1048291048291001', business_id: '1304712777970662' });
  });

  it('captures network exceptions', async () => {
    fetchMock.mockRejectedValueOnce(new Error('DNS failure'));

    expect(await discoverBusinessWabaAccounts('biz_1', TOKEN)).toEqual({ success: false, wabas: [], error: 'DNS failure' });
  });
});

describe('discoverWabaPhoneNumbers', () => {
  it('requires a system user token', async () => {
    expect(await discoverWabaPhoneNumbers('waba_1')).toEqual({
      success: false,
      phoneNumbers: [],
      error: 'Access token missing',
    });
  });

  it('maps phone lines and applies Meta-healthy defaults', async () => {
    respondWith({ data: [{ id: 'phone_1', display_phone_number: '+91 95323 58574', verified_name: 'iBloom' }] });

    const result = await discoverWabaPhoneNumbers('waba_1', TOKEN);

    expect(result.phoneNumbers[0]).toEqual({
      id: 'phone_1',
      waba_id: 'waba_1',
      display_phone_number: '+91 95323 58574',
      verified_name: 'iBloom',
      quality_rating: 'GREEN',
      code_verification_status: 'VERIFIED',
      messaging_limit_tier: 'TIER_1K',
      name_status: 'APPROVED',
      is_test_number: false,
    });
  });

  it('treats UNKNOWN quality lines as test numbers', async () => {
    respondWith({ data: [{ id: 'phone_2', quality_rating: 'UNKNOWN' }] });

    const result = await discoverWabaPhoneNumbers('waba_1', TOKEN);

    expect(result.phoneNumbers[0]).toMatchObject({ is_test_number: true, verified_name: 'iBloom Verified Line' });
  });

  it('returns the sandbox test line when the WABA has no phone numbers', async () => {
    respondWith({ data: [] });

    const result = await discoverWabaPhoneNumbers('waba_1', TOKEN);

    expect(result.phoneNumbers).toHaveLength(1);
    expect(result.phoneNumbers[0]).toMatchObject({ id: '1099281099281099', messaging_limit_tier: 'TIER_250', is_test_number: true });
  });

  it('captures network exceptions', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    expect(await discoverWabaPhoneNumbers('waba_1', TOKEN)).toEqual({
      success: false,
      phoneNumbers: [],
      error: 'ECONNRESET',
    });
  });
});

describe('fetchWabaHealthStatus', () => {
  it('assumes availability when the token or WABA id is missing', async () => {
    expect(await fetchWabaHealthStatus('waba_1')).toEqual({ can_send_message: 'AVAILABLE' });
    expect(await fetchWabaHealthStatus('', TOKEN)).toEqual({ can_send_message: 'AVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps the Meta health_status payload', async () => {
    respondWith({ health_status: { can_send_message: 'LIMITED', additional_info: 'Messaging limit reached' } });

    expect(await fetchWabaHealthStatus('waba_1', TOKEN)).toMatchObject({
      can_send_message: 'LIMITED',
      additional_info: 'Messaging limit reached',
    });
  });

  it('defaults to AVAILABLE when Meta omits health_status', async () => {
    respondWith({});

    expect(await fetchWabaHealthStatus('waba_1', TOKEN)).toEqual({
      can_send_message: 'AVAILABLE',
      additional_info: 'Meta Graph API v25.0 Health Normal',
    });
  });

  it('degrades gracefully on network exceptions', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    expect(await fetchWabaHealthStatus('waba_1', TOKEN)).toEqual({
      can_send_message: 'AVAILABLE',
      additional_info: 'Health check skipped',
    });
  });
});

describe('WhatsApp business profile', () => {
  it('returns null without a token or phone id', async () => {
    expect(await getWhatsappBusinessProfile('phone_1')).toBeNull();
    expect(await getWhatsappBusinessProfile('', TOKEN)).toBeNull();
  });

  it('returns the first profile entry', async () => {
    respondWith({ data: [{ messaging_product: 'whatsapp', about: 'iBloom CRM' }] });

    expect(await getWhatsappBusinessProfile('phone_1', TOKEN)).toEqual({ messaging_product: 'whatsapp', about: 'iBloom CRM' });
  });

  it('returns null for an empty profile payload or a network exception', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith({ data: [] });
    expect(await getWhatsappBusinessProfile('phone_1', TOKEN)).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await getWhatsappBusinessProfile('phone_1', TOKEN)).toBeNull();
  });

  it('POSTs profile updates with the messaging_product marker', async () => {
    respondWith({ success: true });

    expect(await updateWhatsappBusinessProfile('phone_1', { about: 'New about' }, TOKEN)).toEqual({ success: true });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ messaging_product: 'whatsapp', about: 'New about' });
  });

  it('reports missing identifiers and Meta rejections on update', async () => {
    expect(await updateWhatsappBusinessProfile('', {}, TOKEN)).toEqual({ success: false, error: 'Phone ID or token missing' });

    respondWith({ error: { message: 'Invalid parameter' } });
    expect(await updateWhatsappBusinessProfile('phone_1', {}, TOKEN)).toEqual({ success: false, error: 'Invalid parameter' });

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await updateWhatsappBusinessProfile('phone_1', {}, TOKEN)).toEqual({ success: false, error: 'offline' });
  });
});

describe('fetchWabaMessageTemplates', () => {
  it('requires both a WABA id and a token', async () => {
    expect(await fetchWabaMessageTemplates('waba_1')).toEqual({
      success: false,
      templates: [],
      error: 'WABA ID or System User Access Token missing.',
    });
  });

  it('normalizes Meta templates into the CRM shape', async () => {
    respondWith({ data: [{ id: 'tpl_1', name: 'order_update', components: [{ type: 'BODY' }] }] });

    const result = await fetchWabaMessageTemplates('waba_1', TOKEN);

    expect(result.success).toBe(true);
    expect(result.templates[0]).toEqual({
      meta_template_id: 'tpl_1',
      name: 'order_update',
      status: 'APPROVED',
      category: 'MARKETING',
      language: 'en_US',
      rejected_reason: null,
      components: [{ type: 'BODY' }],
    });
    expect(requestedUrls()[0]).toContain('/waba_1/message_templates');
  });

  it('returns an empty template list when Meta returns no data', async () => {
    respondWith({});

    expect(await fetchWabaMessageTemplates('waba_1', TOKEN)).toEqual({ success: true, templates: [] });
  });

  it('surfaces Meta API errors and network exceptions', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith({ error: { message: 'Object does not exist' } });

    expect(await fetchWabaMessageTemplates('waba_1', TOKEN)).toEqual({
      success: false,
      templates: [],
      error: 'Object does not exist',
    });

    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await fetchWabaMessageTemplates('waba_1', TOKEN)).toEqual({
      success: false,
      templates: [],
      error: 'ECONNRESET',
    });
  });
});
