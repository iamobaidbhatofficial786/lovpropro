import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, jsonResponse } from '../utils/cors';
import { createLicenseAdmin, verifyAdminSecret } from '../utils/license-service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return jsonResponse(res, { success: false, error: 'Method not allowed' }, 405);
  }

  if (!verifyAdminSecret(req)) {
    return jsonResponse(res, { success: false, error: 'Unauthorized. Invalid ADMIN_SECRET.' }, 401);
  }

  try {
    const { customer_name, customer_email, plan, max_devices, expires_at } = req.body || {};

    const result = await createLicenseAdmin({
      customer_name,
      customer_email,
      plan: plan || 'pro',
      max_devices: max_devices ?? 1,
      expires_at: expires_at || null,
    });

    if (!result.success) {
      return jsonResponse(res, result, 500);
    }

    return jsonResponse(res, {
      success: true,
      license_key: result.license_key,
      license: {
        id: result.license?.id,
        plan: result.license?.plan || plan,
        max_devices: result.license?.max_devices,
        expires_at: result.license?.expires_at,
        customer_name: result.license?.customer_name,
        customer_email: result.license?.customer_email,
        status: 'active',
      },
      message: 'License created. Save the license_key — it will not be shown again.',
    }, 201);
  } catch (err: any) {
    console.error('[API Create License] Error:', err);
    return jsonResponse(res, { success: false, error: 'Network/server error.' }, 500);
  }
}
