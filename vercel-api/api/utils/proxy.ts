import { VercelResponse } from '@vercel/node';
import { AuthenticatedRequest } from './auth-middleware';

export async function proxyToUpstream(
  req: AuthenticatedRequest,
  res: VercelResponse,
  upstreamPath: string
) {
  const upstreamBase = process.env.UPSTREAM_API_BASE || 'https://lov.powerkits.net';
  const masterApiKey = process.env.POWERKITS_API_KEY || 'pk_lov_ext_a8f3c21e9d4b7f0e6a2c5d8b1e4f7a0c';
  const url = `${upstreamBase}${upstreamPath}`;

  // Build request body, replacing the client license key with "INTERNAL" for upstream verification
  const clientBody = req.body || {};
  const bodyToSend = {
    ...clientBody,
    license_key: 'INTERNAL',
  };

  // Keep original header keys except apikey and authorization
  const headersToSend: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': masterApiKey,
    'Authorization': `Bearer ${masterApiKey}`,
  };

  try {
    const upstreamResponse = await fetch(url, {
      method: req.method || 'POST',
      headers: headersToSend,
      body: JSON.stringify(bodyToSend),
    });

    const status = upstreamResponse.status;
    const text = await upstreamResponse.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw: text };
    }

    res.status(status).json(data);
  } catch (err: any) {
    console.error(`[Upstream Proxy Error] Path ${upstreamPath}:`, err);
    res.status(500).json({ success: false, error: `Upstream connection failed: ${err.message}` });
  }
}
