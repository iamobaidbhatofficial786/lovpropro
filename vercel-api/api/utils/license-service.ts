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
  notes?: string | null;
  created_at: string;
  updated_at: string;
  revoked?: boolean;
  suspended?: boolean;
  expired?: boolean;
  active?: boolean;
  admin_message?: string | null;
  support_url?: string | null;
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
  admin_message?: string | null;
  support_url?: string | null;
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
  try {
    const tokenHash = sha256(token);
    await supabase.from('license_sessions').insert({
      license_id: licenseId,
      device_id: deviceId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });
  } catch {
    // license_sessions table may not exist yet — session still valid via JWT
  }
}

async function revokeSession(token: string): Promise<void> {
  try {
    const tokenHash = sha256(token);
    await supabase
      .from('license_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null);
  } catch {
    // optional table
  }
}

async function isSessionRevoked(token: string): Promise<boolean> {
  try {
    const tokenHash = sha256(token);
    const { data, error } = await supabase
      .from('license_sessions')
      .select('revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) return false;
    return !!(data && data.revoked_at);
  } catch {
    return false;
  }
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

function resolveCustomerName(license: LicenseRow): string {
  if (license.customer_name?.trim()) {
    return license.customer_name.trim();
  }
  if (license.notes?.trim()) {
    const parts = license.notes.split('|');
    const firstPart = parts[0]?.trim();
    if (firstPart && firstPart.length < 50 && !firstPart.includes('@')) {
      return firstPart;
    }
  }
  return normalizePlan(license);
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
    user_name: resolveCustomerName(license),
    message: 'License activated successfully!',
    admin_message: license.admin_message || '',
    support_url: license.support_url || '',
  };
}

export async function getActiveDeviceCount(licenseId: string): Promise<number> {
  const { count: countNew } = await supabase
    .from('license_devices')
    .select('*', { count: 'exact', head: true })
    .eq('license_id', licenseId);

  const { count: countLegacy } = await supabase
    .from('devices')
    .select('*', { count: 'exact', head: true })
    .eq('license_id', licenseId);

  return (countNew || 0) + (countLegacy || 0);
}

export async function syncActivationCount(licenseId: string): Promise<number> {
  const count = await getActiveDeviceCount(licenseId);
  await supabase
    .from('licenses')
    .update({ activation_count: count, updated_at: new Date().toISOString() })
    .eq('id', licenseId);
  return count;
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

      let freshToken = sessionId;
      const expMs = decoded.exp * 1000;
      if (expMs - Date.now() < 12 * 60 * 60 * 1000) {
        freshToken = buildToken(license, deviceId);
        const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await createSession(license.id, deviceId, freshToken, sessionExpiry);
      }

      return {
        success: true,
        valid: true,
        allowed: true,
        token: freshToken,
        session_id: freshToken,
        expires_at: license.expires_at,
        status: 'active',
        plan: normalizePlan(license),
        user_name: resolveCustomerName(license),
        message: 'License is valid.',
        admin_message: license.admin_message || '',
        support_url: license.support_url || '',
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
    // Enforce real-time counting to prevent race conditions or out-of-sync bypasses
    const activeCount = await syncActivationCount(license.id);

    if (activeCount >= license.max_devices) {
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

    // Sync count immediately after registration
    await syncActivationCount(license.id);
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
    user_name: resolveCustomerName(lic),
    message: 'License is valid.',
    admin_message: lic.admin_message || '',
    support_url: lic.support_url || '',
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

    // Sync activation count in a self-healing way
    await syncActivationCount(decoded.license_id);
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

  const insertPayload: Record<string, unknown> = {
    license_key_hash: hash,
    plan_name: params.plan || 'pro',
    max_devices: params.max_devices ?? 1,
    expires_at: params.expires_at || null,
    status: 'active',
    active: true,
    activation_count: 0,
  };

  const notesParts = [params.customer_name, params.customer_email].filter(Boolean);
  if (notesParts.length) insertPayload.notes = notesParts.join(' | ');

  let { data, error } = await supabase.from('licenses').insert(insertPayload).select('*').single();

  if (error && /customer_|plan'|updated_at/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('licenses')
      .insert({
        license_key_hash: hash,
        plan_name: params.plan || 'pro',
        max_devices: params.max_devices ?? 1,
        expires_at: params.expires_at || null,
        notes: notesParts.join(' | ') || '',
        status: 'active',
        active: true,
        activation_count: 0,
      })
      .select('*')
      .single());
  }

  if (error && /plan_name/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('licenses')
      .insert({
        license_key_hash: hash,
        plan: params.plan || 'pro',
        customer_name: params.customer_name || null,
        customer_email: params.customer_email || null,
        max_devices: params.max_devices ?? 1,
        expires_at: params.expires_at || null,
        status: 'active',
        activation_count: 0,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single());
  }

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
      user_name: result.user_name,
      expires_at: result.expires_at,
      message: result.message,
      reason: result.reason,
      token: result.token,
      session_id: result.session_id,
      force_logout: !result.valid || result.reason === 'revoked' || result.reason === 'expired' || result.reason === 'inactive',
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

export async function listLicensesAdmin(query?: string): Promise<LicenseRow[]> {
  let dbQuery = supabase.from('licenses').select('*');
  if (query?.trim()) {
    const q = query.trim();
    if (/^LPK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(q)) {
      dbQuery = dbQuery.eq('license_key_hash', sha256(q));
    } else {
      dbQuery = dbQuery.or(`plan_name.ilike.%${q}%,notes.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%`);
    }
  }
  const { data, error } = await dbQuery.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as LicenseRow[];
}

export async function updateLicenseAdmin(body: {
  id: string;
  plan?: string;
  plan_name?: string;
  customer_name?: string;
  customer_email?: string;
  max_devices?: number;
  expires_at?: string | null;
  notes?: string;
  status?: string;
}): Promise<{ success: boolean; license?: LicenseRow; message?: string }> {
  if (!body.id) return { success: false, message: 'License id required.' };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const plan = body.plan || body.plan_name;
  if (plan !== undefined) {
    updates.plan = plan;
    updates.plan_name = plan;
  }
  if (body.customer_name !== undefined) updates.customer_name = body.customer_name;
  if (body.customer_email !== undefined) updates.customer_email = body.customer_email;
  if (body.max_devices !== undefined) updates.max_devices = body.max_devices;
  if (body.expires_at !== undefined) updates.expires_at = body.expires_at || null;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (body.status !== undefined) {
    updates.status = body.status;
    updates.active = body.status === 'active';
    updates.suspended = body.status === 'suspended' || body.status === 'inactive';
    updates.revoked = body.status === 'revoked';
    updates.expired = body.status === 'expired';
  }

  const { data, error } = await supabase.from('licenses').update(updates).eq('id', body.id).select('*').single();
  if (error) return { success: false, message: error.message };
  return { success: true, license: data as LicenseRow };
}

export async function deleteLicenseAdmin(id: string): Promise<{ success: boolean; message?: string }> {
  await supabase.from('license_devices').delete().eq('license_id', id);
  await supabase.from('devices').delete().eq('license_id', id);
  try {
    await supabase.from('license_sessions').delete().eq('license_id', id);
  } catch { /* optional table */ }
  const { error } = await supabase.from('licenses').delete().eq('id', id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: 'License deleted.' };
}

export async function resetLicenseDevicesAdmin(licenseId: string): Promise<{ success: boolean; message?: string }> {
  if (!licenseId) return { success: false, message: 'license_id required.' };
  await supabase.from('license_devices').delete().eq('license_id', licenseId);
  await supabase.from('devices').delete().eq('license_id', licenseId);
  try {
    await supabase.from('license_sessions').update({ revoked_at: new Date().toISOString() }).eq('license_id', licenseId).is('revoked_at', null);
  } catch { /* optional */ }
  await supabase.from('licenses').update({ activation_count: 0, updated_at: new Date().toISOString() }).eq('id', licenseId);
  return { success: true, message: 'All devices removed. User must re-activate.' };
}

export async function removeUserAccessAdmin(licenseId: string): Promise<{ success: boolean; message?: string }> {
  if (!licenseId) return { success: false, message: 'license_id required.' };
  await resetLicenseDevicesAdmin(licenseId);
  await supabase.from('licenses').update({
    status: 'revoked',
    revoked: true,
    active: false,
    suspended: false,
    updated_at: new Date().toISOString(),
  }).eq('id', licenseId);
  return { success: true, message: 'User access removed. Extension will logout on next check.' };
}

export async function listDevicesAdmin(licenseId?: string, query?: string): Promise<any[]> {
  const results: any[] = [];

  let ldQuery = supabase.from('license_devices').select('*, licenses(plan_name, customer_name, plan, status)');
  if (licenseId) ldQuery = ldQuery.eq('license_id', licenseId);
  const { data: ld } = await ldQuery.order('last_seen_at', { ascending: false });
  if (ld) {
    ld.forEach((d) => results.push({ ...d, source: 'license_devices', device_hash: d.device_id }));
  }

  let devQuery = supabase.from('devices').select('*, licenses(plan_name, customer_name, plan, status)');
  if (licenseId) devQuery = devQuery.eq('license_id', licenseId);
  const { data: legacy } = await devQuery.order('last_seen', { ascending: false });
  if (legacy) {
    legacy.forEach((d) => {
      if (!results.some((r) => r.license_id === d.license_id && (r.device_id || r.device_hash) === d.device_hash)) {
        results.push({ ...d, source: 'devices' });
      }
    });
  }

  if (query?.trim()) {
    const q = query.toLowerCase();
    return results.filter((d) =>
      (d.device_id || d.device_hash || '').toLowerCase().includes(q)
      || (d.ip_address || '').toLowerCase().includes(q)
      || (d.device_name || '').toLowerCase().includes(q),
    );
  }
  return results;
}

export async function removeDeviceAdmin(params: {
  id?: string;
  licenseId?: string;
  deviceId?: string;
}): Promise<{ success: boolean; message?: string }> {
  let licenseId = params.licenseId;

  if (params.id) {
    const { data: ld } = await supabase.from('license_devices').select('license_id, device_id').eq('id', params.id).maybeSingle();
    if (ld) {
      licenseId = ld.license_id;
      await supabase.from('license_devices').delete().eq('id', params.id);
      await supabase.from('devices').delete().eq('license_id', ld.license_id).eq('device_hash', ld.device_id);
    } else {
      const { data: dev } = await supabase.from('devices').select('license_id, device_hash').eq('id', params.id).maybeSingle();
      if (!dev) return { success: false, message: 'Device not found.' };
      licenseId = dev.license_id;
      await supabase.from('devices').delete().eq('id', params.id);
      await supabase.from('license_devices').delete().eq('license_id', dev.license_id).eq('device_id', dev.device_hash);
    }
  } else if (licenseId && params.deviceId) {
    await supabase.from('license_devices').delete().eq('license_id', licenseId).eq('device_id', params.deviceId);
    await supabase.from('devices').delete().eq('license_id', licenseId).eq('device_hash', params.deviceId);
  } else {
    return { success: false, message: 'Device id or license_id+device_id required.' };
  }

  if (licenseId) {
    // Sync activation count in a self-healing way
    await syncActivationCount(licenseId);
    try {
      await supabase.from('license_sessions').update({ revoked_at: new Date().toISOString() }).eq('license_id', licenseId).eq('device_id', params.deviceId || '');
    } catch { /* optional */ }
  }

  return { success: true, message: 'Device removed. Extension will logout on next check.' };
}

export function verifyAdminSecret(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const header = req.headers['x-admin-secret'] || req.headers['authorization'];
  const secret = (process.env.ADMIN_SECRET || '').trim();
  if (!secret) return false;
  if (typeof header === 'string' && header.trim() === secret) return true;
  if (typeof header === 'string' && header.replace(/^Bearer\s+/i, '').trim() === secret) return true;
  return false;
}
