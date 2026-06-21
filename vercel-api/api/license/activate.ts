import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../utils/supabase';
import { sha256, signJwt, verifyJwt } from '../utils/crypto';
import { handleCors, jsonResponse } from '../utils/cors';
import { logSecurityEvent } from '../utils/abuse-detection';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS handling (must be first)
  if (handleCors(req, res)) return;

  // Options handling is performed by handleCors above

  if (req.method !== 'POST') {
    return jsonResponse(res, { success: false, error: 'Method not allowed' }, 405);
  }

  const { license_key, device_id, heartbeat, session_id, browser_fingerprint } = req.body;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'Unknown';
  const country = (req.headers['x-vercel-ip-country'] as string) || 'Unknown';

  if (!license_key) {
    return jsonResponse(res, { success: false, valid: false, message: 'License key is required.' }, 400);
  }

  const deviceHash = device_id || 'default_device_hash';
  const hashedKey = sha256(license_key);

  try {
    // 1. Fetch license
    const { data: license, error: licError } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key_hash', hashedKey)
      .single();

    if (licError || !license) {
      return jsonResponse(res, {
        success: false,
        valid: false,
        message: 'Invalid license key. Please check your key and try again.',
      }, 200);
    }

    // 2. Check general status
    if (license.revoked) {
      return jsonResponse(res, { success: false, valid: false, message: 'This license has been revoked.', reason: 'revoked' }, 200);
    }
    if (license.suspended) {
      return jsonResponse(res, { success: false, valid: false, message: 'This license is suspended.', reason: 'suspended' }, 200);
    }
    if (license.expired || (license.expires_at && new Date(license.expires_at).getTime() < Date.now())) {
      // Auto-update expired flag in db
      if (!license.expired) {
        await supabase.from('licenses').update({ expired: true, status: 'expired' }).eq('id', license.id);
      }
      return jsonResponse(res, { success: false, valid: false, message: 'This license has expired.', reason: 'expired' }, 200);
    }

    // 3. Heartbeat support in activation route for compatibility
    if (heartbeat === true || req.body.heartbeat === 'true') {
      try {
        const decoded = verifyJwt(session_id);
        if (decoded.license_id !== license.id || decoded.device_hash !== deviceHash) {
          throw new Error('Token payload mismatch');
        }

        // Update device seen status
        const { data: dev } = await supabase
          .from('devices')
          .select('id, status')
          .eq('license_id', license.id)
          .eq('device_hash', deviceHash)
          .single();

        if (!dev || dev.status === 'blocked') {
          return res.status(200).json({ success: false, valid: false, allowed: false, message: 'Device blocked or not registered.', reason: 'device_blocked' });
        }

        await supabase
          .from('devices')
          .update({ last_seen: new Date().toISOString(), ip_address: ipAddress, country })
          .eq('id', dev.id);

        // Log heartbeat activation
        await supabase.from('activations').insert({
          license_id: license.id,
          device_id: dev.id,
          action: 'heartbeat',
          ip_address: ipAddress,
          country,
        });

        return jsonResponse(res, {
           success: true,
           valid: true,
           allowed: true,
           expires_at: license.expires_at,
           status: license.status,
           user_name: license.plan_name,
         }, 200);
      } catch (err) {
        return jsonResponse(res, {
           success: false,
           valid: false,
           allowed: false,
           message: 'Session expired or invalid. Please revalidate.',
           reason: 'invalid_session',
         }, 200);
      }
    }

    // 4. Normal Activation Flow
    // Check if device is already registered
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('*')
      .eq('license_id', license.id)
      .eq('device_hash', deviceHash)
      .single();

    let deviceId = '';

    if (!existingDevice) {
      // Verify limit
      if (license.activation_count >= license.max_devices) {
        await logSecurityEvent(license.id, null, 'device_limit_exceeded', { deviceHash, ipAddress, country }, ipAddress, country);
        return jsonResponse(res, {
           success: false,
           valid: false,
           message: `Activation limit exceeded. This license allows up to ${license.max_devices} devices.`,
           reason: 'device_conflict',
         }, 200);
      }

      // Add device
      const { data: newDev, error: devInsertError } = await supabase
        .from('devices')
        .insert({
          license_id: license.id,
          device_hash: deviceHash,
          browser_fingerprint: browser_fingerprint || {},
          ip_address: ipAddress,
          country,
          status: 'active',
        })
        .select('id')
        .single();

      if (devInsertError || !newDev) {
        throw new Error('Failed to register device.');
      }
      deviceId = newDev.id;

      // Update license activation count
      await supabase
        .from('licenses')
        .update({ activation_count: license.activation_count + 1 })
        .eq('id', license.id);
    } else {
      if (existingDevice.status === 'blocked') {
        return jsonResponse(res, {
           success: false,
           valid: false,
           message: 'This device is blocked. Contact support.',
           reason: 'blocked',
         }, 200);
      }
      deviceId = existingDevice.id;

      // Update last seen
      await supabase
        .from('devices')
        .update({ last_seen: new Date().toISOString(), ip_address: ipAddress, country })
        .eq('id', deviceId);
    }

    // Log activation event
    await supabase.from('activations').insert({
      license_id: license.id,
      device_id: deviceId,
      action: 'activate',
      ip_address: ipAddress,
      country,
    });

    // Create JWT token payload
    const tokenPayload = {
      license_id: license.id,
      plan: license.plan_name,
      device_hash: deviceHash,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const jwtToken = signJwt(tokenPayload);

    // Default validity logic for Countdown
    const finalExpiry = license.expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    return jsonResponse(res, {
        success: true,
        valid: true,
        token: jwtToken,
        session_id: jwtToken,
        expires_at: finalExpiry,
        status: license.status,
        user_name: license.plan_name,
        message: 'License activated successfully!',
      }, 200);
  } catch (err: any) {
    console.error('[API Activate] Error:', err);
    return jsonResponse(res, {
        success: false,
        valid: false,
        message: 'Internal server error: ' + (err.message || ''),
      }, 500);
  }
}
