# Chrome Extension Licensing & Protection System Deployment Guide

This guide details the steps required to deploy the licensing, protection, and management system to production.

---

## 1. Database Setup (Supabase)

1. Create a new PostgreSQL database on [Supabase](https://supabase.com/).
2. Navigate to the **SQL Editor** in the Supabase Dashboard.
3. Create a new query, paste the contents of `supabase/migrations/20260620000000_init_licensing.sql`, and click **Run**.
4. This creates the `licenses`, `devices`, `activations`, `admin_users`, and `security_events` tables, along with all performance indexes.

### Add Administrator Account
To seed your first admin dashboard user, run the following SQL query, replacing the email and password hash.
*(You can generate a bcrypt hash for your password using any online tool or Node script. For example, the hash below corresponds to password `AdminPassword123`)*:
```sql
INSERT INTO admin_users (email, password_hash, role)
VALUES ('admin@powerkits.net', '$2a$10$tM.yF.7c6Jg3gA7EaM78E.P31v8t1yJp.8jJ1Jt2c3hB1d2e3f4g5', 'admin');
```

---

## 2. Generate RS256 Cryptographic Keys

The licensing system uses asymmetric RS256 JWT tokens. You must generate a private/public keypair:

1. **Generate RSA private key:**
   ```bash
   openssl genrsa -out private.pem 2048
   ```
2. **Convert private key to PKCS8 format:**
   ```bash
   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private.pem -out pkcs8_private.pem
   ```
3. **Extract RSA public key:**
   ```bash
   openssl rsa -in private.pem -pubout -out public.pem
   ```

* Keep `pkcs8_private.pem` secure. It will be pasted into Vercel's environment variables (`JWT_PRIVATE_KEY`).
* Copy the contents of `public.pem` and paste it into the `JWT_PUBLIC_KEY` constant in `security.js`.

---

## 3. Serverless API Deployment (Vercel)

The serverless backend handles activation, verification, heartbeats, and acts as a gateway for premium actions.

1. Navigate to the `vercel-api` directory.
2. Create a `.env` file from `.env.example` and set:
   * `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from your Supabase Project Settings).
   * `ADMIN_SECRET` (a strong random string).
   * `JWT_PRIVATE_KEY` (copy PKCS8 PEM private key text, replacing newlines with `\n` to form a single line string).
   * `JWT_PUBLIC_KEY` (copy public key PEM text, replacing newlines with `\n`).
   * `POWERKITS_API_KEY` (set to `pk_lov_ext_a8f3c21e9d4b7f0e6a2c5d8b1e4f7a0c`).
   * `UPSTREAM_API_BASE` (set to `https://lov.powerkits.net`).
3. Deploy to Vercel:
   ```bash
   npm install -g vercel
   vercel login
   vercel
   ```
4. Note your deployment URL (e.g. `https://your-vercel-app.vercel.app`).
5. Configure Vercel Production Environment Variables in the Vercel dashboard using the same `.env` values, and run `vercel --prod` to deploy to production.

---

## 4. Admin Dashboard Deployment

The Next.js Admin Dashboard provides a visual control center for managing licenses, unbinding devices, and monitoring alerts.

1. Navigate to the `admin-dashboard` directory.
2. Create a `.env` file and set:
   * `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (for client side DB queries).
   * `SUPABASE_SERVICE_ROLE_KEY` (for server actions).
   * `ADMIN_SECRET` (must match the `ADMIN_SECRET` used in Vercel API).
3. Install dependencies and run locally to test:
   ```bash
   npm install
   npm run dev
   ```
4. Deploy the dashboard to Vercel:
   ```bash
   vercel
   ```
5. Add the environment variables to Vercel settings and deploy to production: `vercel --prod`.

---

## 5. Chrome Extension Obfuscation & Loading

To bundle the Chrome Extension for distribution:

1. Update `POWERKITS_API_BASE` in `extension-config.js` to your deployed Vercel API URL.
2. Ensure `INTERNAL_LICENSE_MODE` is set to `false` in `extension-config.js`.
3. Paste your generated `public.pem` key contents into the `JWT_PUBLIC_KEY` constant in `security.js`.
4. Navigate to the `obfuscation` directory:
   ```bash
   npm install
   npm run build
   ```
5. The obfuscated, production-ready extension will be compiled inside the `dist/` directory in the project root.
6. To load the extension in Chrome:
   * Open Chrome and go to `chrome://extensions/`.
   * Enable **Developer mode** in the top right.
   * Click **Load unpacked** and select the compiled `dist/` folder.

---

## 6. Security Hardening Checklist

* **CORS Restrictions**: Change `'Access-Control-Allow-Origin', '*'` to specify your extension ID (e.g. `chrome-extension://[your-extension-id]`) or your specific domain mapping in Vercel.
* **Service Role Security**: Keep your `SUPABASE_SERVICE_ROLE_KEY` secret. Never expose it in client-side code.
* **Obfuscation**: Always release the extension using the compiled `dist/` folder, never the raw source files. The obfuscator flattens control flows and base64-encrypts string values to prevent casual cracking.
* **Cron-Trigger Heartbeats**: To run the daily abuse detection auditing scan automatically, configure a Vercel Cron Job in your `vercel.json` pointing to `/api/license/heartbeat` with the `Authorization: Bearer [ADMIN_SECRET]` header.
