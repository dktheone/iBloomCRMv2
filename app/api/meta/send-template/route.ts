import { NextResponse } from 'next/server';
import { PLATFORM_CONFIG } from '@/config/platform.config';

const GRAPH_API_BASE = `https://graph.facebook.com/${PLATFORM_CONFIG.metaApiVersion}`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone_number_id, recipient_phone, template_name, language, access_token } = body;

    if (!phone_number_id || !recipient_phone || !template_name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: phone_number_id, recipient_phone, template_name' },
        { status: 400 }
      );
    }

    const token = access_token || PLATFORM_CONFIG.systemUserAccessToken;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Access token not configured. Check PLATFORM_CONFIG.systemUserAccessToken.' },
        { status: 401 }
      );
    }

    const cleanedRecipient = recipient_phone.replace(/\s+/g, '').replace(/^\+/, '');

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanedRecipient,
      type: 'template',
      template: {
        name: template_name,
        language: {
          code: language || 'en_US',
        },
      },
    };

    // Attach body parameter components if provided
    if (Array.isArray(body.components) && body.components.length > 0) {
      payload.template.components = body.components;
    }

    const url = `${GRAPH_API_BASE}/${phone_number_id}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      return NextResponse.json(
        {
          success: false,
          error: data.error?.message || `Meta API returned ${res.status}`,
          errorCode: data.error?.code,
          errorType: data.error?.type,
          metaResponse: data,
        },
        { status: res.ok ? 502 : res.status }
      );
    }

    return NextResponse.json({
      success: true,
      metaMessageId: data.messages?.[0]?.id || null,
      contactWaId: data.contacts?.[0]?.wa_id || null,
      metaResponse: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server Exception' },
      { status: 500 }
    );
  }
}
