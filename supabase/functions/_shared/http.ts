export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return jsonResponse(
      {
        error: error.code,
        message: error.message,
      },
      error.status,
    );
  }

  // Do not serialize database errors, request bodies, or credentials.
  return jsonResponse(
    {
      error: 'INTERNAL_ERROR',
      message: 'No se pudo completar la operacion.',
    },
    500,
  );
}

export function optionsResponse() {
  return new Response('ok', { headers: corsHeaders });
}

export function assertPost(request: Request) {
  if (request.method === 'OPTIONS') return false;
  if (request.method !== 'POST') {
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Usa POST para esta operacion.');
  }
  return true;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'El cuerpo de la solicitud no es JSON valido.');
  }

  if (!isRecord(value)) {
    throw new ApiError(400, 'INVALID_BODY', 'El cuerpo de la solicitud no es valido.');
  }
  return value;
}

export function requiredString(body: Record<string, unknown>, field: string, maxLength: number) {
  const value = body[field];
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_INPUT', `El campo ${field} es obligatorio.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ApiError(400, 'INVALID_INPUT', `El campo ${field} no es valido.`);
  }
  return normalized;
}

export function optionalString(body: Record<string, unknown>, field: string, maxLength: number) {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new ApiError(400, 'INVALID_INPUT', `El campo ${field} no es valido.`);
  }
  return value.trim();
}

export function requiredUuid(body: Record<string, unknown>, field: string) {
  const value = requiredString(body, field, 80);
  if (!isUuid(value)) {
    throw new ApiError(400, 'INVALID_INPUT', `El campo ${field} no es un UUID valido.`);
  }
  return value;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getBearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Falta una credencial valida.');
  }
  return match[1];
}

export function getRequestAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
