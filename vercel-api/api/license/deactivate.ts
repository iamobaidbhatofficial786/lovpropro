import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, jsonResponse } from '../utils/cors';
import { deactivateLicense } from '../utils/license-service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, { success: false, error: 'Method not allowed' }, 405);
  }

  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'Unknown';

  try {
    const { token, session_id } = req.body || {};
    const result = await deactivateLicense({
      token: token || session_id,
      ipAddress,
    });
    return jsonResponse(res, result, result.success ? 200 : 401);
  } catch (err: any) {
    console.error('[API Deactivate] Error:', err);
    return jsonResponse(res, { success: false, message: 'Network/server error.' }, 500);
  }
}
