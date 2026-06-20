import { VercelRequest, VercelResponse } from '@vercel/node';
import { validateLicenseRequest } from '../utils/auth-middleware';
import { proxyToUpstream } from '../utils/proxy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-license-key, x-session-id, x-device-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authReq = await validateLicenseRequest(req, res);
  if (!authReq) return;

  await proxyToUpstream(authReq, res, '/functions/v1/remove-watermark');
}
