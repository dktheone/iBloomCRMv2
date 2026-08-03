import { apiException, apiSuccess } from '@/lib/api/response';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessName, occasion, purpose, action } = body;

    // Structured Meta-compliant AI generation response
    const generatedCopy = `Hello *{{1}}*! Welcome to *${businessName || 'iBloom Store'}*. To celebrate our ${occasion || 'Product Launch'}, we are giving you an exclusive *20% discount*! Use promo code *SAVE20* at checkout.`;

    return apiSuccess({
      template: {
        category: 'MARKETING',
        bodyText: generatedCopy,
        footerText: 'Reply STOP to opt out.',
        variables: [{ index: 1, exampleValue: 'Customer' }],
        buttons: [
          {
            id: `btn-${Date.now()}`,
            type: 'URL',
            text: action || 'Claim Offer',
            value: 'https://ibloomsolutions.com/offer',
          },
        ],
      },
    });
  } catch (err: any) {
    return apiException(err, 'AI Generation Exception');
  }
}
