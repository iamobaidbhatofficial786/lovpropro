import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, jsonResponse } from '../utils/cors';
import { verifyAdminSecret, listDevicesAdmin, removeDeviceAdmin } from '../utils/license-service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (!verifyAdminSecret(req)) {
    return jsonResponse(res, { success: false, error: 'Unauthorized.' }, 401);
  }

  try {
    if (req.method === 'GET') {
      const licenseId = req.query.license_id as string;
      const query = (req.query.query as string) || '';
      const devices = await listDevicesAdmin(licenseId, query);
      return jsonResponse(res, { success: true, devices }, 200);
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id as string) || req.body?.id;
      const licenseId = (req.query.license_id as string) || req.body?.license_id;
      const deviceId = (req.query.device_id as string) || req.body?.device_id;
      const result = await removeDeviceAdmin({ id, licenseId, deviceId });
      return jsonResponse(res, result, result.success ? 200 : 400);
    }

    return jsonResponse(res, { success: false, error: 'Method not allowed' }, 405);
  } catch (err: any) {
    console.error('[Admin Devices]', err);
    return jsonResponse(res, { success: false, error: err.message || 'Server error' }, 500);
  }
}
