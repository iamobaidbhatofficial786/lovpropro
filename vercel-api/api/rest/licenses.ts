import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../utils/supabase';
import { sha256 } from '../utils/crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-license-key, x-session-id, x-device-id, x-signature, x-nonce, x-timestamp');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse query parameters
  const query = req.query;
  const select = query.select as string;
  const licenseKeyEq = query.license_key as string;

  // Expected format of license_key parameter in supabase filter: eq.XXXX-XXXX-XXXX-XXXX-XXXX
  let licenseKey = '';
  if (licenseKeyEq && licenseKeyEq.startsWith('eq.')) {
    licenseKey = licenseKeyEq.substring(3);
  }

  if (!licenseKey) {
    return res.status(200).json([]);
  }

  try {
    const hashedKey = sha256(licenseKey);

    // Query our licenses table using the hashed key
    const { data: license, error } = await supabase
      .from('licenses')
      .select('id, plan_name')
      .eq('license_key_hash', hashedKey)
      .single();

    if (error || !license) {
      return res.status(200).json([]);
    }

    // Return the license ID as user_id for role checking purposes
    return res.status(200).json([
      {
        user_id: license.id,
        plan_name: license.plan_name,
      },
    ]);
  } catch (err: any) {
    console.error('[API REST Licenses Error]:', err);
    return res.status(500).json({ error: err.message });
  }
}
