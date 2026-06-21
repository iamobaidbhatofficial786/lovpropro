import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Set the required CORS headers on the response */
export function setCorsHeaders(res: VercelResponse): void {
  // CORS header list required by the extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    [
      'content-type',
      'authorization',
      'apikey',
      'x-device-id',
      'x-nonce',
      'x-signature',
      'x-timestamp',
      'x-license-key',
      'x-session-id',
      'x-admin-secret',
    ].join(', '),
  );
}

/** Handle pre‑flight OPTIONS requests. Returns true when the request was OPTIONS and the response is already sent. */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

/** Helper to send a JSON payload while guaranteeing CORS headers are present. */
export function jsonResponse(
  res: VercelResponse,
  data: any,
  statusCode: number = 200,
): VercelResponse {
  setCorsHeaders(res);
  return res.status(statusCode).json(data);
}
