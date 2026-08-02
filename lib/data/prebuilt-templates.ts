import { PrebuiltTemplate } from '../types/template-types';

export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    id: 'pb-ecom-1',
    codeName: 'order_summary_alert',
    title: 'Order Summary Notification',
    sector: 'E-Commerce',
    subcategory: 'Order Summary',
    category: 'UTILITY',
    language: 'en_US',
    headerType: 'TEXT',
    headerText: 'Order Confirmation #{{1}}',
    bodyText: 'Hello *{{1}}*! Thank you for your order with iBloom Shop. Your items (Order ID: *{{2}}*) totaling *₹{{3}}* have been confirmed and are being processed.',
    footerText: 'Thank you for shopping with us!',
    defaultVariables: [
      { index: 1, exampleValue: 'Alex Morgan' },
      { index: 2, exampleValue: 'ORD-9841' },
      { index: 3, exampleValue: '1,499' }
    ],
    buttons: [
      { id: 'b1', type: 'URL', text: 'Track Order', value: 'https://ibloomsolutions.com/orders/ORD-9841' }
    ]
  },
  {
    id: 'pb-ecom-2',
    codeName: 'cart_abandonment_reminder',
    title: 'Cart Abandonment Offer',
    sector: 'E-Commerce',
    subcategory: 'Cart Reminder',
    category: 'MARKETING',
    marketingSubtype: 'LIMITED_TIME_OFFER',
    language: 'en_US',
    headerType: 'IMAGE',
    bodyText: 'Hi *{{1}}*, you left items in your shopping cart! Complete your purchase within the next 24 hours to get *15% OFF* with promo code *SAVE15*.',
    footerText: 'Reply STOP to opt out.',
    defaultVariables: [
      { index: 1, exampleValue: 'Sarah' }
    ],
    buttons: [
      { id: 'b1', type: 'URL', text: 'Checkout Cart Now', value: 'https://ibloomsolutions.com/cart' }
    ]
  },
  {
    id: 'pb-fin-1',
    codeName: 'kyc_update_required',
    title: 'KYC Document Renewal',
    sector: 'Finance',
    subcategory: 'KYC Update',
    category: 'UTILITY',
    language: 'en_US',
    headerType: 'TEXT',
    headerText: 'Action Required: KYC Verification',
    bodyText: 'Dear *{{1}}*, your account KYC documents for account ending in *{{2}}* require re-verification by *{{3}}*. Please upload your updated ID.',
    footerText: 'iBloom Secure Financial Services',
    defaultVariables: [
      { index: 1, exampleValue: 'David Miller' },
      { index: 2, exampleValue: '4829' },
      { index: 3, exampleValue: '15th August' }
    ],
    buttons: [
      { id: 'b1', type: 'URL', text: 'Upload KYC ID', value: 'https://ibloomsolutions.com/kyc' }
    ]
  },
  {
    id: 'pb-health-1',
    codeName: 'appointment_booking_reminder',
    title: 'Doctor Appointment Alert',
    sector: 'Healthcare',
    subcategory: 'Appointment Booking',
    category: 'UTILITY',
    language: 'en_US',
    headerType: 'TEXT',
    headerText: 'Appointment Reminder',
    bodyText: 'Hello *{{1}}*, this is a friendly reminder for your upcoming consultation with Dr. *{{2}}* scheduled for *{{3}}* at *{{4}}*.',
    footerText: 'iBloom Health Clinic',
    defaultVariables: [
      { index: 1, exampleValue: 'Emma Watson' },
      { index: 2, exampleValue: 'Rajesh Sharma' },
      { index: 3, exampleValue: 'Tomorrow' },
      { index: 4, exampleValue: '10:30 AM' }
    ],
    buttons: [
      { id: 'b1', type: 'PHONE_NUMBER', text: 'Call Clinic', value: '+919876543210' },
      { id: 'b2', type: 'QUICK_REPLY', text: 'Confirm Slot', value: 'Confirm' }
    ]
  },
  {
    id: 'pb-fashion-1',
    codeName: 'new_collection_launch',
    title: 'New Collection VIP Announcement',
    sector: 'Fashion',
    subcategory: 'New Collection',
    category: 'MARKETING',
    marketingSubtype: 'STANDARD',
    language: 'en_US',
    headerType: 'IMAGE',
    bodyText: 'Hey *{{1}}*! Our new Summer Collection is officially live! As a VIP customer, enjoy an exclusive *20% discount* on all new arrivals.',
    footerText: 'Reply STOP to opt out.',
    defaultVariables: [
      { index: 1, exampleValue: 'Jessica' }
    ],
    buttons: [
      { id: 'b1', type: 'URL', text: 'Browse New Catalog', value: 'https://ibloomsolutions.com/fashion' }
    ]
  },
  {
    id: 'pb-gen-1',
    codeName: 'auth_security_otp',
    title: 'Authentication Security OTP',
    sector: 'General',
    subcategory: 'Security Verification',
    category: 'AUTHENTICATION',
    language: 'en_US',
    headerType: 'NONE',
    bodyText: '*{{1}}* is your security code to complete verification. Do not share this code with anyone.',
    footerText: 'Valid for 10 minutes.',
    defaultVariables: [
      { index: 1, exampleValue: '849201' }
    ],
    buttons: [
      { id: 'b1', type: 'QUICK_REPLY', text: 'Copy Code', value: 'Copy Code' }
    ]
  }
];
