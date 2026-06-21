#!/usr/bin/env node
/**
 * Admin CLI — create a license key (shown once).
 *
 * Usage:
 *   node scripts/create-license.js --admin-secret YOUR_SECRET --api-url https://your-app.vercel.app
 *
 * Optional:
 *   --customer-name "John Doe"
 *   --customer-email "john@example.com"
 *   --plan pro
 *   --max-devices 2
 *   --expires-at "2027-12-31T23:59:59Z"
 */

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

async function main() {
  const adminSecret = getArg('--admin-secret') || process.env.ADMIN_SECRET;
  const apiUrl = (getArg('--api-url') || process.env.VERCEL_URL || 'http://localhost:3000').replace(/\/$/, '');

  if (!adminSecret) {
    console.error('Error: Set ADMIN_SECRET env var or pass --admin-secret');
    process.exit(1);
  }

  const body = {
    customer_name: getArg('--customer-name') || 'Customer',
    customer_email: getArg('--customer-email') || null,
    plan: getArg('--plan') || 'pro',
    max_devices: parseInt(getArg('--max-devices') || '1', 10),
    expires_at: getArg('--expires-at') || null,
  };

  const res = await fetch(`${apiUrl}/api/license/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': adminSecret,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    console.error('Failed:', data.error || data.message || res.statusText);
    process.exit(1);
  }

  console.log('\n=== LICENSE CREATED ===');
  console.log('License Key (save now — shown once):', data.license_key);
  console.log('Plan:', data.license?.plan);
  console.log('Max devices:', data.license?.max_devices);
  console.log('Expires:', data.license?.expires_at || 'never');
  console.log('========================\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
