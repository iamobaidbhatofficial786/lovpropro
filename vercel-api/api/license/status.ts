import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, jsonResponse } from '../utils/cors';
import { getLicenseStatus, verifyAdminSecret } from '../utils/license-service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return jsonResponse(res, { success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const token = (req.query.token as string)
      || (req.headers['x-session-id'] as string)
      || (req.headers['authorization'] as string)?.replace(/^Bearer\s+/i, '');
    const licenseKey = req.query.license_key as string;
    const deviceId = (req.query.device_id as string) || (req.headers['x-device-id'] as string);

    if (!token && !licenseKey) {
      return jsonResponse(res, { success: false, message: 'Provide token or license_key query parameter.' }, 400);
    }

    const result = await getLicenseStatus({ token, licenseKey, deviceId });
    return jsonResponse(res, result, 200);
  } catch (err: any) {
    console.error('[API Status] Error:', err);
    return jsonResponse(res, { success: false, message: 'Network/server error.' }, 500);
  }
}
