import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyJwt } from './crypto';
import { supabase } from './supabase';
import { logSecurityEvent, calculateAbuseScore } from './abuse-detection';
import { setCorsHeaders } from './cors';
import crypto from 'crypto';

export interface AuthenticatedRequest extends VercelRequest {
  licenseId?: string;
  plan?: string;
  deviceHash?: string;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function computeHmacSha256(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export async function validateLicenseRequest(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthenticatedRequest | null> {
  setCorsHeaders(res);
  const body = req.body || {};
  const token = body.session_id || req.headers['x-session-id'] || req.headers['authorization']?.toString().replace(/^Bearer\s+/i, '');
  const deviceHash = req.headers['x-device-id'] || body.device_id || body.device_hash;
  const rawLicenseKey = req.headers['x-license-key'] || body.license_key;
  
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'Unknown';
  const country = (req.headers['x-vercel-ip-country'] as string) || 'Unknown';

  // 1. Enforce JWT presence
  if (!token) {
    await logSecurityEvent(null, null, 'failed_validation_missing_token', { ipAddress }, ipAddress, country);
    res.status(401).json({ success: false, error: 'Unauthorized: Session token missing.' });
    return null;
  }

  try {
    // 2. Verify JWT signature & expiry
    let decoded: any;
    try {
      decoded = verifyJwt(token as string);
    } catch (jwtErr: any) {
      await logSecurityEvent(null, null, 'failed_session_validation', { error: jwtErr.message, ipAddress }, ipAddress, country);
      res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired session token.' });
      return null;
    }

    const { license_id, device_hash: tokenDeviceHash, plan } = decoded;

    // 3. Verify request signature (HMAC-SHA256)
    const signature = req.headers['x-signature'] as string;
    const nonce = req.headers['x-nonce'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    if (!signature || !nonce || !timestamp) {
      await logSecurityEvent(license_id, null, 'failed_validation_missing_signature_headers', { ipAddress }, ipAddress, country);
      res.status(400).json({ success: false, error: 'Bad Request: Security headers missing.' });
      return null;
    }

    // 4. Replay attack prevention (timestamp check & nonce check)
    const timeDiff = Math.abs(Date.now() - new Date(timestamp).getTime());
    if (isNaN(timeDiff) || timeDiff > 5 * 60 * 1000) {
      await logSecurityEvent(license_id, null, 'failed_validation_expired_timestamp', { timestamp, ipAddress }, ipAddress, country);
      res.status(400).json({ success: false, error: 'Bad Request: Request timestamp has expired.' });
      return null;
    }

    // Nonce validation in database
    const { data: usedNonce } = await supabase
      .from('used_nonces')
      .select('nonce')
      .eq('nonce', nonce)
      .single();

    if (usedNonce) {
      await logSecurityEvent(license_id, null, 'failed_validation_replay_attack', { nonce, ipAddress }, ipAddress, country);
      res.status(400).json({ success: false, error: 'Bad Request: Nonce already used.' });
      return null;
    }

    // Insert nonce to database
    await supabase.from('used_nonces').insert({ nonce });

    // 5. Query DB to verify license state
    const { data: license } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', license_id)
      .single();

    if (!license || !license.active || license.status !== 'active') {
      await logSecurityEvent(license_id, null, 'failed_validation_inactive_license', { ipAddress }, ipAddress, country);
      res.status(403).json({ success: false, error: 'Forbidden: License is inactive, suspended, or revoked.' });
      return null;
    }

    // Get the license key to verify signature
    // Fallback signature key is the static API key if rawLicenseKey is not supplied
    const signatureKey = rawLicenseKey || process.env.PUBLIC_API_KEY || process.env.POWERKITS_API_KEY || '';
    
    // Verify HMAC signature
    const method = req.method || "POST";
    const bodyStr = req.body ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body)) : "";
    
    // Check possible matching URLs (support full URL and pathname checks)
    const host = req.headers.host || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const reqPath = req.url || '';
    
    const possibleUrls = [
      `${protocol}://${host}${reqPath}`,
      `${protocol}://${host}/functions/v1${reqPath.substring(reqPath.lastIndexOf('/'))}`,
      `https://lovable-powerkits-644.vercel.app/functions/v1${reqPath.substring(reqPath.lastIndexOf('/'))}`,
      `https://lovable-powerkits-644.vercel.app${reqPath}`
    ];
    
    let isSigValid = false;
    for (const url of possibleUrls) {
      const stringToSign = [method.toUpperCase(), url, timestamp, nonce, bodyStr].join('|');
      const expectedSig = computeHmacSha256(signatureKey as string, stringToSign);
      if (signature === expectedSig) {
        isSigValid = true;
        break;
      }
    }

    if (!isSigValid) {
      await logSecurityEvent(license_id, null, 'failed_signature_validation', { signature, ipAddress }, ipAddress, country);
      res.status(403).json({ success: false, error: 'Forbidden: Request signature is invalid.' });
      return null;
    }

    // 6. Cross-check device hash (device binding)
    if (deviceHash && tokenDeviceHash !== deviceHash) {
      await logSecurityEvent(license_id, null, 'device_mismatch', { tokenDeviceHash, deviceHash, ipAddress }, ipAddress, country);
      res.status(403).json({ success: false, error: 'Forbidden: Device hash mismatch.' });
      return null;
    }

    // 7. Verify device status is active (license_devices or legacy devices)
    let device: { id: string; status?: string } | null = null;
    const { data: newDevice } = await supabase
      .from('license_devices')
      .select('id')
      .eq('license_id', license_id)
      .eq('device_id', tokenDeviceHash)
      .maybeSingle();

    if (newDevice) {
      device = { id: newDevice.id, status: 'active' };
    } else {
      const { data: legacyDevice } = await supabase
        .from('devices')
        .select('id, status')
        .eq('license_id', license_id)
        .eq('device_hash', tokenDeviceHash)
        .maybeSingle();
      device = legacyDevice;
    }

    if (!device || device.status === 'blocked') {
      await logSecurityEvent(license_id, null, 'device_mismatch', { tokenDeviceHash, ipAddress }, ipAddress, country);
      res.status(403).json({ success: false, error: 'Forbidden: Device is not authorized or blocked.' });
      return null;
    }

    // 8. Real-time Rate Limiting (max 60 premium requests per minute per license)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: requestsCount } = await supabase
      .from('activations')
      .select('*', { count: 'exact', head: true })
      .eq('license_id', license_id)
      .eq('action', 'premium_request')
      .gte('created_at', oneMinuteAgo);

    if (requestsCount && requestsCount > 60) {
      await logSecurityEvent(license_id, device.id, 'rate_limit_exceeded', { count: requestsCount, ipAddress }, ipAddress, country);
      res.status(429).json({ success: false, error: 'Too many requests. Rate limit exceeded.' });
      return null;
    }

    // 9. Real-time Abuse & Anti-Sharing protection
    const abuseReport = await calculateAbuseScore(license_id);
    if (abuseReport.level === 'High Risk') {
      // Suspend license instantly
      await supabase
        .from('licenses')
        .update({ status: 'suspended', active: false, suspended: true, notes: `[AUTO-SUSPEND] High risk activity detected. Flags: ${abuseReport.flags.join(', ')}` })
        .eq('id', license_id);
      
      await logSecurityEvent(license_id, device.id, 'license_autosuspended', { score: abuseReport.score, flags: abuseReport.flags, ipAddress }, ipAddress, country);
      res.status(403).json({ success: false, error: 'Forbidden: License suspended due to suspicious activity (sharing detected).' });
      return null;
    } else if (abuseReport.level === 'Suspicious') {
      await logSecurityEvent(license_id, device.id, 'suspicious_activity', { score: abuseReport.score, flags: abuseReport.flags, ipAddress }, ipAddress, country);
    }

    // Log the current premium action in activations table
    await supabase.from('activations').insert({
      license_id,
      device_id: device.id,
      action: 'premium_request',
      ip_address: ipAddress,
      country,
    });

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

export const requireValidLicense = validateLicenseRequest;

