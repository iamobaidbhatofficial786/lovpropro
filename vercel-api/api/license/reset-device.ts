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
      // 1. Remove specific device
      const { data: dev } = await supabase
        .from('devices')
        .select('id')
        .eq('license_id', license_id)
        .eq('device_hash', device_hash)
        .single();

      if (dev) {
        await supabase.from('devices').delete().eq('id', dev.id);

        const { data: license } = await supabase
          .from('licenses')
          .select('activation_count')
          .eq('id', license_id)
          .single();

        if (license) {
          const newCount = Math.max(0, license.activation_count - 1);
          await supabase.from('licenses').update({ activation_count: newCount }).eq('id', license_id);
        }
      }
      return res.status(200).json({ success: true, message: `Device ${device_hash} removed.` });
    } else {
      // 2. Full reset: remove all devices
      await supabase.from('devices').delete().eq('license_id', license_id);
      await supabase.from('licenses').update({ activation_count: 0 }).eq('id', license_id);
      return res.status(200).json({ success: true, message: 'All devices reset for this license.' });
    }
  } catch (err: any) {
    console.error('[API Reset Device] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
