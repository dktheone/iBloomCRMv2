import type { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { logValidationFailure } from '@/lib/security/audit-logger';
import { getRequestMeta } from '@/lib/api/request';
import { apiError } from '@/lib/api/response';

export type ValidationOutcome<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

/**
 * Runs a Zod schema against a request payload, records every rejected field in the
 * security audit table and builds the `{ error, fieldErrors }` 400 response.
 */
export async function validatePayload<T>(
  schema: ZodType<T>,
  body: unknown,
  request: Request,
  formSurface: string,
  errorMessage: string = 'Validation failed.'
): Promise<ValidationOutcome<T>> {
  const result = schema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const { ipAddress, userAgent } = getRequestMeta(request);
  const fieldErrors: Record<string, string> = {};

  for (const issue of result.error.issues) {
    const fieldName = issue.path.join('.') || 'payload';
    fieldErrors[fieldName] = issue.message;

    await logValidationFailure({
      formSurface,
      rejectedField: fieldName,
      failureReason: issue.message,
      ipAddress,
      userAgent,
    });
  }

  return { success: false, response: apiError(errorMessage, 400, { fieldErrors }) };
}
