import { VercelRequest, VercelResponse } from '@vercel/node';
import { validateLicenseRequest } from '../utils/auth-middleware';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-upsert, x-license-key, x-session-id, x-device-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Authenticate client session
  const authReq = await validateLicenseRequest(req, res);
  if (!authReq) return;

  // 2. Extract path
  const queryPath = req.query.path;
  const path = Array.isArray(queryPath) ? queryPath.join('/') : (queryPath || '');

  if (!path) {
    return res.status(400).json({ success: false, error: 'Storage object path is missing' });
  }

  const upstreamBase = process.env.UPSTREAM_API_BASE || 'https://lov.powerkits.net';
  const masterApiKey = process.env.POWERKITS_API_KEY || 'pk_lov_ext_a8f3c21e9d4b7f0e6a2c5d8b1e4f7a0c';
  const url = `${upstreamBase}/storage/v1/object/prompt-images/${path}`;

  try {
    const rawBody = await getRawBody(req);
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    const upstreamResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'apikey': masterApiKey,
        'Authorization': `Bearer ${masterApiKey}`,
        'x-upsert': 'true',
      },
      body: rawBody,
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
    console.error('[Storage Proxy Upload Error]:', err);
    res.status(500).json({ success: false, error: `Storage proxy upload failed: ${err.message}` });
  }
}
