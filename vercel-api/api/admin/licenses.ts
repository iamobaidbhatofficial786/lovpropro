import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, jsonResponse } from '../utils/cors';
import {
  verifyAdminSecret,
  createLicenseAdmin,
  listLicensesAdmin,
  updateLicenseAdmin,
  deleteLicenseAdmin,
  removeUserAccessAdmin,
  resetLicenseDevicesAdmin,
} from '../utils/license-service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (!verifyAdminSecret(req)) {
    return jsonResponse(res, { success: false, error: 'Unauthorized. Invalid admin secret.' }, 401);
  }

  try {
    if (req.method === 'GET') {
      const query = (req.query.query as string) || '';
      const licenses = await listLicensesAdmin(query);
      return jsonResponse(res, { success: true, licenses }, 200);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'remove_access') {
        const result = await removeUserAccessAdmin(body.license_id);
        return jsonResponse(res, result, result.success ? 200 : 400);
      }
      if (body.action === 'reset_devices') {
        const result = await resetLicenseDevicesAdmin(body.license_id);
        return jsonResponse(res, result, result.success ? 200 : 400);
      }

      const result = await createLicenseAdmin({
        customer_name: body.customer_name,
        customer_email: body.customer_email,
        plan: body.plan || body.plan_name || 'pro',
        max_devices: body.max_devices,
        expires_at: body.expires_at,
      });
      if (!result.success) return jsonResponse(res, result, 500);
      return jsonResponse(res, {
        success: true,
        license_key: result.license_key,
        license: result.license,
        rawKey: result.license_key,
      }, 201);
    }

    if (req.method === 'PATCH') {
      const result = await updateLicenseAdmin(req.body || {});
      return jsonResponse(res, result, result.success ? 200 : 400);
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id as string) || req.body?.id;
      if (!id) return jsonResponse(res, { success: false, error: 'License id required.' }, 400);
      const result = await deleteLicenseAdmin(id);
      return jsonResponse(res, result, result.success ? 200 : 400);
    }

    return jsonResponse(res, { success: false, error: 'Method not allowed' }, 405);
  } catch (err: any) {
    console.error('[Admin Licenses]', err);
    return jsonResponse(res, { success: false, error: err.message || 'Server error' }, 500);
  }
}
