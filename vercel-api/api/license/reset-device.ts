import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../utils/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Authorize using ADMIN_SECRET
  const authHeader = req.headers['authorization'] || '';
  const adminSecret = process.env.ADMIN_SECRET || '';

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin Secret.' });
  }

  const { license_id, device_hash } = req.body;

  if (!license_id) {
    return res.status(400).json({ success: false, error: 'license_id is required.' });
  }

  try {
    if (device_hash) {
      // 1. Remove specific device from both new and legacy tables
      await supabase.from('license_devices').delete().eq('license_id', license_id).eq('device_id', device_hash);
      await supabase.from('devices').delete().eq('license_id', license_id).eq('device_hash', device_hash);

      // Revoke sessions for this device
      try {
        await supabase.from('license_sessions').update({ revoked_at: new Date().toISOString() }).eq('license_id', license_id).eq('device_id', device_hash);
      } catch (e) {}

      // Recalculate remaining devices across both tables
      const { count: countNew } = await supabase.from('license_devices').select('*', { count: 'exact', head: true }).eq('license_id', license_id);
      const { count: countLegacy } = await supabase.from('devices').select('*', { count: 'exact', head: true }).eq('license_id', license_id);
      const total = (countNew || 0) + (countLegacy || 0);

      // Update the licenses activation count in the database
      await supabase.from('licenses').update({ activation_count: total, updated_at: new Date().toISOString() }).eq('id', license_id);

      return res.status(200).json({ success: true, message: `Device ${device_hash} removed.` });
    } else {
      // 2. Full reset: remove all devices from both tables
      await supabase.from('license_devices').delete().eq('license_id', license_id);
      await supabase.from('devices').delete().eq('license_id', license_id);

      // Revoke all sessions for this license
      try {
        await supabase.from('license_sessions').update({ revoked_at: new Date().toISOString() }).eq('license_id', license_id);
      } catch (e) {}

      // Reset activation count to 0 in database
      await supabase.from('licenses').update({ activation_count: 0, updated_at: new Date().toISOString() }).eq('id', license_id);

      return res.status(200).json({ success: true, message: 'All devices reset for this license.' });
    }
  } catch (err: any) {
    console.error('[API Reset Device] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
