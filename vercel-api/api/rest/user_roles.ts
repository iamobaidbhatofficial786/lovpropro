import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../utils/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-license-key, x-session-id, x-device-id, x-signature, x-nonce, x-timestamp');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query;
  const userIdEq = query.user_id as string;

  let userId = '';
  if (userIdEq && userIdEq.startsWith('eq.')) {
    userId = userIdEq.substring(3);
  }

  if (!userId) {
    return res.status(200).json([]);
  }

  try {
    // 1. Check if it's an admin user
    const { data: admin } = await supabase
      .from('admin_users')
      .select('role')
      .eq('id', userId)
      .single();

    if (admin) {
      return res.status(200).json([{ role: admin.role }]);
    }

    // 2. Check if it's a license ID (fallback)
    const { data: license } = await supabase
      .from('licenses')
      .select('plan_name, status')
      .eq('id', userId)
      .single();

    if (license && license.status === 'active') {
      const plan = license.plan_name.toLowerCase();
      if (plan.includes('reseller')) {
        return res.status(200).json([{ role: 'reseller' }]);
      }
      if (plan.includes('admin')) {
        return res.status(200).json([{ role: 'admin' }]);
      }
    }

    return res.status(200).json([]);
  } catch (err: any) {
    console.error('[API REST User Roles Error]:', err);
    return res.status(500).json({ error: err.message });
  }
}
