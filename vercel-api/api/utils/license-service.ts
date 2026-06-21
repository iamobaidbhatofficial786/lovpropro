import { supabase } from './supabase';
import { sha256, signJwt, verifyJwt, generateLicenseKey } from './crypto';
import { logSecurityEvent } from './abuse-detection';

export type LicenseStatus = 'active' | 'inactive' | 'expired' | 'revoked';

export interface LicenseRow {
  id: string;
  license_key_hash: string;
  status: LicenseStatus;
  plan: string;
  plan_name?: string;
  max_devices: number;
  activation_count: number;
  expires_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string;
  updated_at: string;
  revoked?: boolean;
  suspended?: boolean;
  expired?: boolean;
  active?: boolean;
}

export interface ActivateResult {
  success: boolean;
  valid: boolean;
  token?: string;
  session_id?: string;
  expires_at?: string | null;
  status?: string;
  plan?: string;
  user_name?: string;
  message: string;
  reason?: string;
  allowed?: boolean;
}

function normalizePlan(license: LicenseRow): string {
  return license.plan || license.plan_name || 'pro';
}

function normalizeStatus(license: LicenseRow): LicenseStatus {
  if (license.revoked || license.status === 'revoked') return 'revoked';
  if (license.suspended || license.status === 'inactive') return 'inactive';
  if (license.expired || license.status === 'expired') return 'expired';
  return (license.status as LicenseStatus) || 'active';
}

function isLicenseExpired(license: LicenseRow): boolean {
  const status = normalizeStatus(license);
  if (status === 'expired' || license.expired) return true;
  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) return true;
  return false;
}

async function markLicenseExpired(licenseId: string): Promise<void> {
  await supabase
    .from('licenses')
    .update({ status: 'expired', expired: true, active: false, updated_at: new Date().toISOString() })
    .eq('id', licenseId);
}

async function findLicenseByKey(licenseKey: string): Promise<LicenseRow | null> {
  const hashedKey = sha256(licenseKey.trim());
  const { data, error } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_key_hash', hashedKey)
    .single();
  if (error || !data) return null;
  return data as LicenseRow;
}

async function findDevice(licenseId: string, deviceId: string) {
  const { data: newDev } = await supabase
    .from('license_devices')
    .select('*')
    .eq('license_id', licenseId)
    .eq('device_id', deviceId)
    .maybeSingle();

  if (newDev) return { table: 'license_devices' as const, row: newDev };

  const { data: legacyDev } = await supabase
    .from('devices')
    .select('*')
    .eq('license_id', licenseId)
    .eq('device_hash', deviceId)
    .maybeSingle();

  if (legacyDev) return { table: 'devices' as const, row: legacyDev };
  return null;
}

async function registerDevice(
  license: LicenseRow,
  deviceId: string,
  meta: { ipAddress: string; userAgent?: string; deviceName?: string },
): Promise<{ id: string } | null> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('license_devices')
    .insert({
      license_id: license.id,
      device_id: deviceId,
      device_name: meta.deviceName || 'Chrome Extension',
      user_agent: meta.userAgent || null,
      ip_address: meta.ipAddress,
      activated_at: now,
      last_seen_at: now,
    })
    .select('id')
    .single();

  if (!error && data) {
    await supabase
      .from('licenses')
      .update({ activation_count: license.activation_count + 1, updated_at: now })
      .eq('id', license.id);
    return { id: data.id };
  }

  const { data: legacy, error: legacyErr } = await supabase
    .from('devices')
    .insert({
      license_id: license.id,
      device_hash: deviceId,
      ip_address: meta.ipAddress,
      status: 'active',
    })
    .select('id')
    .single();

  if (legacyErr || !legacy) return null;

  await supabase
    .from('licenses')
    .update({ activation_count: license.activation_count + 1, updated_at: now })
    .eq('id', license.id);

  return { id: legacy.id };
}

async function updateDeviceLastSeen(
  deviceRecord: NonNullable<Awaited<ReturnType<typeof findDevice>>>,
  ipAddress: string,
): Promise<void> {
  const now = new Date().toISOString();
  if (deviceRecord.table === 'license_devices') {
    await supabase
      .from('license_devices')
      .update({ last_seen_at: now, ip_address: ipAddress })
      .eq('id', deviceRecord.row.id);
  } else {
    await supabase
      .from('devices')
      .update({ last_seen: now, ip_address: ipAddress })
      .eq('id', deviceRecord.row.id);
  }
}

async function createSession(
  licenseId: string,
  deviceId: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  const tokenHash = sha256(token);
  await supabase.from('license_sessions').insert({
    license_id: licenseId,
    device_id: deviceId,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });
}

async function revokeSession(token: string): Promise<void> {
  const tokenHash = sha256(token);
  await supabase
    .from('license_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('revoked_at', null);
}

async function isSessionRevoked(token: string): Promise<boolean> {
  const tokenHash = sha256(token);
  const { data } = await supabase
    .from('license_sessions')
    .select('revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  return !!(data && data.revoked_at);
}

function buildToken(license: LicenseRow, deviceId: string): string {
  return signJwt({
    license_id: license.id,
    plan: normalizePlan(license),
    device_hash: deviceId,
    device_id: deviceId,
    issued_at: new Date().toISOString(),
  });
}

function activationSuccess(license: LicenseRow, token: string): ActivateResult {
  const plan = normalizePlan(license);
  const finalExpiry = license.expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  return {
    success: true,
    valid: true,
    token,
    session_id: token,
    expires_at: finalExpiry,
    status: normalizeStatus(license) === 'active' ? 'active' : normalizeStatus(license),
    plan,
    user_name: license.customer_name || plan,
    message: 'License activated successfully!',
  };
}

export async function activateLicense(params: {
  licenseKey: string;
  deviceId: string;
  ipAddress: string;
  userAgent?: string;
  heartbeat?: boolean;
  sessionId?: string;
}): Promise<ActivateResult> {
  const { licenseKey, deviceId, ipAddress, userAgent, heartbeat, sessionId } = params;

  if (!licenseKey?.trim()) {
    return { success: false, valid: false, message: 'License key is required.' };
  }
  if (!deviceId?.trim()) {
    return { success: false, valid: false, message: 'Device ID is required.' };
  }

  const license = await findLicenseByKey(licenseKey);
  if (!license) {
    return { success: false, valid: false, message: 'Invalid license key.' };
  }

  const status = normalizeStatus(license);
  if (status === 'revoked' || license.revoked) {
    return { success: false, valid: false, message: 'This license has been revoked.', reason: 'revoked' };
  }
  if (status === 'inactive' || license.suspended) {
    return { success: false, valid: false, message: 'This license is inactive.', reason: 'inactive' };
  }
  if (isLicenseExpired(license)) {
    await markLicenseExpired(license.id);
    return { success: false, valid: false, message: 'License expired.', reason: 'expired' };
  }

  if (heartbeat && sessionId) {
    try {
      const decoded = verifyJwt(sessionId);
      if (decoded.license_id !== license.id || (decoded.device_hash !== deviceId && decoded.device_id !== deviceId)) {
        throw new Error('Token payload mismatch');
      }
      if (await isSessionRevoked(sessionId)) {
        throw new Error('Session revoked');
      }

      const deviceRecord = await findDevice(license.id, deviceId);
      if (!deviceRecord) {
        return { success: false, valid: false, allowed: false, message: 'Device not registered.', reason: 'device_blocked' };
      }

      if (deviceRecord.table === 'devices' && deviceRecord.row.status === 'blocked') {
        return { success: false, valid: false, allowed: false, message: 'This device is blocked.', reason: 'blocked' };
      }

      await updateDeviceLastSeen(deviceRecord, ipAddress);

      return {
        success: true,
        valid: true,
        allowed: true,
        expires_at: license.expires_at,
        status: 'active',
        plan: normalizePlan(license),
        user_name: license.customer_name || normalizePlan(license),
        message: 'License is valid.',
      };
    } catch {
      return {
        success: false,
        valid: false,
        allowed: false,
        message: 'Session expired or invalid. Please revalidate.',
        reason: 'invalid_session',
      };
    }
  }

  const existing = await findDevice(license.id, deviceId);

  if (!existing) {
    if (license.activation_count >= license.max_devices) {
      await logSecurityEvent(license.id, null, 'device_limit_exceeded', { deviceId, ipAddress }, ipAddress, 'Unknown');
      return {
        success: false,
        valid: false,
        message: 'Activation limit exceeded.',
        reason: 'device_conflict',
      };
    }

    const registered = await registerDevice(license, deviceId, { ipAddress, userAgent });
    if (!registered) {
      return { success: false, valid: false, message: 'Network/server error. Please try again.' };
    }
  } else {
    if (existing.table === 'devices' && existing.row.status === 'blocked') {
      return { success: false, valid: false, message: 'This device is blocked. Contact support.', reason: 'blocked' };
    }
    await updateDeviceLastSeen(existing, ipAddress);
  }

  const token = buildToken(license, deviceId);
  const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await createSession(license.id, deviceId, token, sessionExpiry);

  return activationSuccess(license, token);
}

export async function validateLicenseSession(params: {
  token: string;
  deviceId?: string;
  ipAddress: string;
}): Promise<ActivateResult & { active?: boolean; allowed?: boolean }> {
  const { token, deviceId, ipAddress } = params;

  if (!token) {
    return { success: false, valid: false, active: false, allowed: false, message: 'Token is missing.', reason: 'inactive' };
  }

  if (await isSessionRevoked(token)) {
    return { success: false, valid: false, active: false, allowed: false, message: 'Session revoked.', reason: 'revoked' };
  }

  let decoded: any;
  try {
    decoded = verifyJwt(token);
  } catch (err: any) {
    return {
      success: false,
      valid: false,
      active: false,
      allowed: false,
      message: 'Token verification failed: ' + (err.message || 'expired'),
      reason: 'inactive',
    };
  }

  const tokenDevice = decoded.device_hash || decoded.device_id;
  if (deviceId && tokenDevice !== deviceId) {
    return { success: false, valid: false, active: false, allowed: false, message: 'Device verification mismatch.', reason: 'device_conflict' };
  }

  const { data: license, error } = await supabase.from('licenses').select('*').eq('id', decoded.license_id).single();
  if (error || !license) {
    return { success: false, valid: false, active: false, allowed: false, message: 'License not found.', reason: 'inactive' };
  }

  const lic = license as LicenseRow;
  const status = normalizeStatus(lic);
  if (status === 'revoked' || lic.revoked) {
    return { success: false, valid: false, active: false, allowed: false, message: 'License revoked.', reason: 'revoked' };
  }
  if (status === 'inactive' || lic.suspended) {
    return { success: false, valid: false, active: false, allowed: false, message: 'License inactive.', reason: 'inactive' };
  }
  if (isLicenseExpired(lic)) {
    await markLicenseExpired(lic.id);
    return { success: false, valid: false, active: false, allowed: false, message: 'License expired.', reason: 'expired' };
  }

  const deviceRecord = await findDevice(lic.id, tokenDevice);
  if (!deviceRecord) {
    return { success: false, valid: false, active: false, allowed: false, message: 'Device not registered.', reason: 'inactive' };
  }

  if (deviceRecord.table === 'devices' && deviceRecord.row.status === 'blocked') {
    return { success: false, valid: false, active: false, allowed: false, message: 'Device blocked.', reason: 'device_blocked' };
  }

  await updateDeviceLastSeen(deviceRecord, ipAddress);

  let freshToken = token;
  const expMs = decoded.exp * 1000;
  if (expMs - Date.now() < 12 * 60 * 60 * 1000) {
    freshToken = buildToken(lic, tokenDevice);
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await createSession(lic.id, tokenDevice, freshToken, sessionExpiry);
  }

  const plan = normalizePlan(lic);
  return {
    success: true,
    valid: true,
    active: true,
    allowed: true,
    token: freshToken,
    session_id: freshToken,
    expires_at: lic.expires_at,
    status: 'active',
    plan,
    user_name: lic.customer_name || plan,
    message: 'License is valid.',
  };
}

export async function deactivateLicense(params: {
  token: string;
  ipAddress: string;
}): Promise<{ success: boolean; message: string }> {
  const { token, ipAddress } = params;
  if (!token) {
    return { success: false, message: 'Session token is required.' };
  }

  let decoded: any;
  try {
    decoded = verifyJwt(token);
  } catch {
    return { success: false, message: 'Invalid or expired token.' };
  }

  const deviceId = decoded.device_hash || decoded.device_id;
  const deviceRecord = await findDevice(decoded.license_id, deviceId);

  if (deviceRecord) {
    if (deviceRecord.table === 'license_devices') {
      await supabase.from('license_devices').delete().eq('id', deviceRecord.row.id);
    } else {
      await supabase.from('devices').delete().eq('id', deviceRecord.row.id);
    }

    const { data: license } = await supabase.from('licenses').select('activation_count').eq('id', decoded.license_id).single();
    if (license) {
      await supabase
        .from('licenses')
        .update({
          activation_count: Math.max(0, license.activation_count - 1),
          updated_at: new Date().toISOString(),
        })
        .eq('id', decoded.license_id);
    }
  }

  await revokeSession(token);

  await supabase.from('activations').insert({
    license_id: decoded.license_id,
    device_id: deviceRecord?.row.id || null,
    action: 'deactivate',
    ip_address: ipAddress,
  }).then(() => {});

  return { success: true, message: 'Device deactivated successfully.' };
}

export async function createLicenseAdmin(params: {
  customer_name?: string;
  customer_email?: string;
  plan?: string;
  max_devices?: number;
  expires_at?: string | null;
}): Promise<{ success: boolean; license_key?: string; license?: LicenseRow; message?: string }> {
  const rawKey = generateLicenseKey();
  const hash = sha256(rawKey);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('licenses')
    .insert({
      license_key_hash: hash,
      plan: params.plan || 'pro',
      plan_name: params.plan || 'pro',
      customer_name: params.customer_name || null,
      customer_email: params.customer_email || null,
      max_devices: params.max_devices ?? 1,
      expires_at: params.expires_at || null,
      status: 'active',
      active: true,
      activation_count: 0,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) {
    return { success: false, message: 'Failed to create license: ' + (error?.message || 'unknown') };
  }

  return { success: true, license_key: rawKey, license: data as LicenseRow };
}

export async function getLicenseStatus(params: {
  token?: string;
  licenseKey?: string;
  deviceId?: string;
}): Promise<any> {
  if (params.token) {
    const result = await validateLicenseSession({
      token: params.token,
      deviceId: params.deviceId,
      ipAddress: 'status-check',
    });
    return {
      success: result.success,
      valid: result.valid,
      active: result.active,
      status: result.status,
      plan: result.plan,
      expires_at: result.expires_at,
      message: result.message,
    };
  }

  if (params.licenseKey) {
    const license = await findLicenseByKey(params.licenseKey);
    if (!license) {
      return { success: false, valid: false, message: 'Invalid license key.' };
    }
    return {
      success: true,
      valid: normalizeStatus(license) === 'active' && !isLicenseExpired(license),
      status: isLicenseExpired(license) ? 'expired' : normalizeStatus(license),
      plan: normalizePlan(license),
      max_devices: license.max_devices,
      activation_count: license.activation_count,
      expires_at: license.expires_at,
      customer_name: license.customer_name,
    };
  }

  return { success: false, message: 'Provide token or license_key.' };
}

export function verifyAdminSecret(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const header = req.headers['x-admin-secret'] || req.headers['authorization'];
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  if (typeof header === 'string' && header === secret) return true;
  if (typeof header === 'string' && header.replace(/^Bearer\s+/i, '') === secret) return true;
  return false;
}
