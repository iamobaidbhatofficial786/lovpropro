import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, jsonResponse } from '../utils/cors';
import { validateLicenseSession } from '../utils/license-service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, { success: false, error: 'Method not allowed' }, 405);
  }

  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'Unknown';

  try {
    const body = req.body || {};
    const token = body.token || body.session_id || req.headers['x-session-id'] || req.headers['authorization']?.toString().replace(/^Bearer\s+/i, '');
    const deviceId = body.device_id || body.device_hash || req.headers['x-device-id'] as string;

    const result = await validateLicenseSession({ token: token as string, deviceId, ipAddress });
    return jsonResponse(res, result, 200);
  } catch (err: any) {
    console.error('[API Validate] Error:', err);
    return jsonResponse(res, {
      success: false,
      valid: false,
      active: false,
      allowed: false,
      message: 'Network/server error. Please try again.',
    }, 500);
  }
}
