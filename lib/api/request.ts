/**
 * Client metadata attached to audit records by the API routes.
 */
export interface RequestMeta {
  ipAddress: string;
  userAgent: string;
}

export function getRequestMeta(request: Request): RequestMeta {
  return {
    ipAddress: request.headers.get('x-forwarded-for') || '127.0.0.1',
    userAgent: request.headers.get('user-agent') || 'Unknown User-Agent',
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export function getPaginationParams(searchParams: URLSearchParams, defaultLimit: number): PaginationParams {
  return {
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || String(defaultLimit), 10),
  };
}
