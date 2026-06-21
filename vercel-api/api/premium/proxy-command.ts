import { VercelRequest, VercelResponse } from '@vercel/node';
import { validateLicenseRequest } from '../utils/auth-middleware';
import { proxyToUpstream } from '../utils/proxy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-license-key, x-session-id, x-device-id, x-signature, x-nonce, x-timestamp');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Authenticate the client
  const authReq = await validateLicenseRequest(req, res);
  if (!authReq) return; // validateLicenseRequest already sent the response if invalid

  // 2. Proxy to upstream
  await proxyToUpstream(authReq, res, '/functions/v1/proxy-command');
}
