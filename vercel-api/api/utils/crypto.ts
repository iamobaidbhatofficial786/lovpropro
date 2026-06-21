import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Generate license key: LPK-XXXX-XXXX-XXXX-XXXX */
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const groups: string[] = [];

  for (let i = 0; i < 4; i++) {
    let group = '';
    const bytes = crypto.randomBytes(4);
    for (let j = 0; j < 4; j++) {
      group += chars[bytes[j] % chars.length];
    }
    groups.push(group);
  }

  return 'LPK-' + groups.join('-');
}

function getJwtSecret(): string | null {
  return process.env.JWT_SECRET || null;
}

function getPrivateKey(): string | null {
  const key = process.env.JWT_PRIVATE_KEY;
  if (!key) return null;
  return key.replace(/\\n/g, '\n');
}

function getPublicKey(): string | null {
  const key = process.env.JWT_PUBLIC_KEY;
  if (!key) return null;
  return key.replace(/\\n/g, '\n');
}

export function signJwt(payload: object): string {
  const secret = getJwtSecret();
  if (secret) {
    return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '24h' });
  }

  const privateKey = getPrivateKey();
  if (!privateKey) {
    throw new Error('JWT_SECRET or JWT_PRIVATE_KEY environment variable is required.');
  }

  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '24h' });
}

export function verifyJwt(token: string): any {
  const secret = getJwtSecret();
  if (secret) {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  }

  const publicKey = getPublicKey();
  if (!publicKey) {
    throw new Error('JWT_SECRET or JWT_PUBLIC_KEY environment variable is required.');
  }

  return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
}
