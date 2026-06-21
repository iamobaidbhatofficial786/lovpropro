import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../utils/supabase';
import { verifyJwt } from '../utils/crypto';

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

  const { token, session_id } = req.body;
  const targetToken = token || session_id;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'Unknown';
  const country = (req.headers['x-vercel-ip-country'] as string) || 'Unknown';

  if (!targetToken) {
    return res.status(400).json({ success: false, message: 'Session token is required.' });
  }

  try {
    // 1. Verify JWT token
    let decoded: any;
    try {
      decoded = verifyJwt(targetToken);
    } catch (err: any) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }

    const { license_id, device_hash } = decoded;

    // 2. Fetch device
    const { data: device } = await supabase
      .from('devices')
      .select('id')
      .eq('license_id', license_id)
      .eq('device_hash', device_hash)
      .single();

    if (device) {
      // Log deactivation activation
      await supabase.from('activations').insert({
        license_id,
        device_id: device.id,
        action: 'deactivate',
        ip_address: ipAddress,
        country,
      });

      // Remove device from DB
      await supabase.from('devices').delete().eq('id', device.id);

      // Decrement activation count
      const { data: license } = await supabase.from('licenses').select('activation_count').eq('id', license_id).single();
      if (license) {
        const newCount = Math.max(0, license.activation_count - 1);
        await supabase.from('licenses').update({ activation_count: newCount }).eq('id', license_id);
      }
    }

    return res.status(200).json({ success: true, message: 'Device deactivated successfully.' });
  } catch (err: any) {
    console.error('[API Deactivate] Error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error: ' + (err.message || '') });
  }
}
