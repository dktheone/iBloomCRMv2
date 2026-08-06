export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type MarketingSubtype = 
  | 'STANDARD' 
  | 'LIMITED_TIME_OFFER' 
  | 'COUPON_CODE' 
  | 'CATALOG' 
  | 'CALL_PERMISSION' 
  | 'CAROUSEL_MEDIA' 
  | 'CAROUSEL_PRODUCT';

export type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';

export type ButtonType = 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY';

export interface TemplateButton {
  id: string;
  type: ButtonType;
  text: string;
  value: string; // URL string or phone number string
}

export interface VariableExample {
  index?: number; // e.g. 1 for {{1}}
  key?: string; // e.g. "name" for {{name}} or "1" for {{1}}
  exampleValue: string; // e.g. "John"
}

export interface WhatsAppTemplate {
  template_uid?: string;
  id?: string; // Compatibility alias
  waba_uid?: string;
  meta_waba_id?: string;
  waba_id?: string; // Compatibility alias
  meta_template_id?: string;
  name: string; // Regex: ^[a-z0-9_]+$
  language: string; // e.g. "en_US"
  category: TemplateCategory;
  marketingSubtype?: MarketingSubtype;
  offerText?: string; // Max 60 chars (for LIMITED_TIME_OFFER)
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DRAFT' | 'DELETED_ON_META' | 'ARCHIVED';
  rejected_reason?: string;
  
  header?: {
    type: HeaderType;
    textValue?: string; // Max 60 chars, no {{n}} variables allowed
    mediaUrl?: string;
    mediaFileName?: string;
    mediaFileSize?: string;
  };
  
  body: {
    text: string; // Max 1000 chars, supports rich formatting & {{n}} variables
    examples: VariableExample[];
  };
  
  footer?: {
    text: string; // Max 60 chars, supports +STOP opt-out
  };
  
  buttons?: TemplateButton[];
  
  authConfig?: {
    otpLength: number; // 4 - 8
    codeExpiryMinutes: number; // 1 - 90
    buttonText: string; // Fixed: "Copy Code"
  };

  components?: any[];

  created_at?: string;
  updated_at?: string;
}

export interface PrebuiltTemplate {
  id: string;
  codeName: string;
  title: string;
  sector: 'E-Commerce' | 'Finance' | 'Healthcare' | 'Fashion' | 'General';
  subcategory: string;
  category: TemplateCategory;
  marketingSubtype?: MarketingSubtype;
  language: string;
  headerType: HeaderType;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  defaultVariables: VariableExample[];
  buttons?: TemplateButton[];
}
