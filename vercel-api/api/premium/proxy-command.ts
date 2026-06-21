import { VercelRequest, VercelResponse } from '@vercel/node';
import { validateLicenseRequest } from '../utils/auth-middleware';
import { proxyToUpstream } from '../utils/proxy';
import { handleCors } from '../utils/cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  const authReq = await validateLicenseRequest(req, res);
  if (!authReq) return;

  await proxyToUpstream(authReq, res, '/functions/v1/proxy-command');
}
