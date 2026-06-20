import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const queryPath = req.query.path;
  const path = Array.isArray(queryPath) ? queryPath.join('/') : (queryPath || '');

  if (!path) {
    return res.status(400).send('Object path is missing.');
  }

  const upstreamBase = process.env.UPSTREAM_API_BASE || 'https://lov.powerkits.net';
  const url = `${upstreamBase}/storage/v1/object/public/prompt-images/${path}`;

  // Redirect to upstream public asset directly
  res.redirect(302, url);
}
