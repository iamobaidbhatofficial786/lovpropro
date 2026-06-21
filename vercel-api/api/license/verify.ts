import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../utils/supabase';
import { verifyJwt, signJwt } from '../utils/crypto';
import { logSecurityEvent } from '../utils/abuse-detection';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-license-key, x-session-id, x-device-id, x-signature, x-nonce, x-timestamp');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { token, session_id, device_hash, device_id } = req.body;
  const targetToken = token || session_id;
  const targetDevice = device_hash || device_id;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'Unknown';
  const country = (req.headers['x-vercel-ip-country'] as string) || 'Unknown';

  if (!targetToken) {
    return res.status(200).json({
      active: false,
      allowed: false,
      message: 'Token is missing.',
      reason: 'inactive',
    });
  }

  try {
    // 1. Verify and decode JWT
    let decoded: any;
    try {
      decoded = verifyJwt(targetToken);
    } catch (jwtErr: any) {
      return res.status(200).json({
        active: false,
        allowed: false,
        message: 'Token verification failed: ' + (jwtErr.message || 'expired'),
        reason: 'inactive',
      });
    }

    const { license_id, device_hash: tokenDeviceHash } = decoded;

    // 2. Validate device hash
    if (targetDevice && tokenDeviceHash !== targetDevice) {
      await logSecurityEvent(license_id, null, 'device_mismatch', { tokenDeviceHash, targetDevice, ipAddress }, ipAddress, country);
      return res.status(200).json({
        active: false,
        allowed: false,
        message: 'Device verification mismatch.',
        reason: 'device_conflict',
      });
    }

    // 3. Query DB for license details
    const { data: license, error: licErr } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', license_id)
      .single();

    if (licErr || !license) {
      return res.status(200).json({
        active: false,
        allowed: false,
        message: 'License not found in database.',
        reason: 'inactive',
      });
    }

    if (license.revoked) {
      return res.status(200).json({ active: false, allowed: false, message: 'License revoked.', reason: 'revoked' });
    }
    if (license.suspended) {
      return res.status(200).json({ active: false, allowed: false, message: 'License suspended.', reason: 'suspended' });
    }
    if (license.expired || (license.expires_at && new Date(license.expires_at).getTime() < Date.now())) {
      if (!license.expired) {
        await supabase.from('licenses').update({ expired: true, status: 'expired' }).eq('id', license.id);
      }
      return res.status(200).json({ active: false, allowed: false, message: 'License expired.', reason: 'expired' });
    }

    // 4. Query DB for device details
    const { data: device, error: devErr } = await supabase
      .from('devices')
      .select('*')
      .eq('license_id', license_id)
      .eq('device_hash', tokenDeviceHash)
      .single();

    if (devErr || !device) {
      return res.status(200).json({
        active: false,
        allowed: false,
        message: 'Device registration lost or unauthorized.',
        reason: 'inactive',
      });
    }

    if (device.status === 'blocked') {
      return res.status(200).json({
        active: false,
        allowed: false,
        message: 'Device blocked.',
        reason: 'device_blocked',
      });
    }

    // 5. Update device last seen
    await supabase
      .from('devices')
      .update({ last_seen: new Date().toISOString(), ip_address: ipAddress, country })
      .eq('id', device.id);

    // Log verification event
    await supabase.from('activations').insert({
      license_id: license.id,
      device_id: device.id,
      action: 'verify',
      ip_address: ipAddress,
      country,
    });

    // 6. Token refresh check (if expiring within 12 hours, generate a new one)
    let freshToken = targetToken;
    const expMs = decoded.exp * 1000;
    const timeUntilExpiry = expMs - Date.now();
    if (timeUntilExpiry < 12 * 60 * 60 * 1000) {
      const newTokenPayload = {
        license_id: license.id,
        plan: license.plan_name,
        device_hash: tokenDeviceHash,
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      freshToken = signJwt(newTokenPayload);
    }

    return res.status(200).json({
      active: true,
      allowed: true,
      success: true,
      valid: true,
      token: freshToken,
      session_id: freshToken,
      expires_at: license.expires_at,
      status: license.status,
      user_name: license.plan_name,
    });
  } catch (err: any) {
    console.error('[API Verify] Error:', err);
    return res.status(500).json({
      active: false,
      allowed: false,
      message: 'Internal server error: ' + (err.message || ''),
      reason: 'inactive',
    });
  }
}
