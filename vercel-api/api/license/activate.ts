import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, jsonResponse } from '../utils/cors';
import { activateLicense } from '../utils/license-service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, { success: false, error: 'Method not allowed' }, 405);
  }

  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'Unknown';

  try {
    const { license_key, device_id, heartbeat, session_id } = req.body || {};
    const result = await activateLicense({
      licenseKey: license_key,
      deviceId: device_id,
      ipAddress,
      userAgent: req.headers['user-agent'] as string,
      heartbeat: heartbeat === true || heartbeat === 'true',
      sessionId: session_id || req.headers['x-session-id'] as string,
    });
    return jsonResponse(res, result, result.success ? 200 : 200);
  } catch (err: any) {
    console.error('[API Activate] Error:', err);
    return jsonResponse(res, {
      success: false,
      valid: false,
      message: 'Network/server error. Please try again.',
    }, 500);
  }
}
