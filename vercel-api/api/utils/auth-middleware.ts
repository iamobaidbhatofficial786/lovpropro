import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt } from './crypto';
import { supabase } from './supabase';
import { logSecurityEvent } from './abuse-detection';

export interface AuthenticatedRequest extends VercelRequest {
  licenseId?: string;
  plan?: string;
  deviceHash?: string;
}

export async function validateLicenseRequest(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthenticatedRequest | null> {
  const body = req.body || {};
  const token = body.session_id || req.headers['x-session-id'] || req.headers['authorization']?.toString().replace(/^Bearer\s+/i, '');
  const deviceHash = body.device_id || req.headers['x-device-id'] || body.device_hash;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'Unknown';
  const country = (req.headers['x-vercel-ip-country'] as string) || 'Unknown';

  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized: Session token missing.' });
    return null;
  }

  try {
    // 1. Verify JWT signature & expiry
    const decoded = verifyJwt(token as string);
    const { license_id, device_hash: tokenDeviceHash, plan } = decoded;

    // 2. Cross-check device hash
    if (deviceHash && tokenDeviceHash !== deviceHash) {
      await logSecurityEvent(license_id, null, 'device_hijacking_attempt', { tokenDeviceHash, deviceHash, ipAddress }, ipAddress, country);
      res.status(403).json({ success: false, error: 'Forbidden: Device hash mismatch.' });
      return null;
    }

    // 3. Query DB to verify license state
    const { data: license } = await supabase
      .from('licenses')
      .select('status, active')
      .eq('id', license_id)
      .single();

    if (!license || !license.active || license.status !== 'active') {
      res.status(403).json({ success: false, error: 'Forbidden: License is inactive, suspended, or revoked.' });
      return null;
    }

    // 4. Verify device status is active
    const { data: device } = await supabase
      .from('devices')
      .select('status')
      .eq('license_id', license_id)
      .eq('device_hash', tokenDeviceHash)
      .single();

    if (!device || device.status !== 'active') {
      res.status(403).json({ success: false, error: 'Forbidden: Device is not authorized or blocked.' });
      return null;
    }

    const authReq = req as AuthenticatedRequest;
    authReq.licenseId = license_id;
    authReq.plan = plan;
    authReq.deviceHash = tokenDeviceHash;

    return authReq;
  } catch (err: any) {
    res.status(401).json({ success: false, error: 'Unauthorized: Invalid session token: ' + (err.message || 'expired') });
    return null;
  }
}
