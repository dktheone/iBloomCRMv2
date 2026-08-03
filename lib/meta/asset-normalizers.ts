/**
 * Meta asset rows reach the app from several sources (Supabase legacy columns,
 * `_uid` columns and raw Graph API payloads) with the same identifier stored
 * under different keys. These helpers coalesce them into a single shape.
 */

export function resolveMetaPhoneId(phone: any): string | undefined {
  return phone?.meta_phone_number_id || phone?.phone_number_id || phone?.phone_line_uid || phone?.id;
}

export function resolveMetaWabaId(waba: any): string | undefined {
  return waba?.meta_waba_id || waba?.waba_id || waba?.waba_uid || waba?.id;
}

export function normalizePhoneRecord(phone: any) {
  const metaPhoneId = resolveMetaPhoneId(phone);

  return {
    ...phone,
    phone_number_id: metaPhoneId,
    meta_phone_number_id: metaPhoneId,
    waba_id: phone?.waba_uid || phone?.waba_id || phone?.meta_waba_id,
    id: phone?.phone_line_uid || phone?.id || phone?.meta_phone_number_id,
  };
}

export function normalizeWabaRecord(waba: any) {
  const metaWabaId = resolveMetaWabaId(waba);

  return {
    ...waba,
    waba_id: metaWabaId,
    meta_waba_id: metaWabaId,
    id: waba?.waba_uid || waba?.id || waba?.meta_waba_id,
  };
}
