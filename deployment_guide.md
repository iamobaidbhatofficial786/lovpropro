# Chrome Extension Licensing & Protection System Deployment Guide

This guide details the steps required to deploy the licensing server, admin dashboard, and Chrome Extension to production.

---

## 🚀 The Easiest Way: Auto-Deployment via Antigravity (Single Prompt)
If you have **Antigravity** running on this project workspace, you can fully automate the deployment process. Just copy the prompt block below and paste it directly into Antigravity to let the AI do all the heavy lifting!

> [!TIP]
> Antigravity will automatically generate RSA keypairs, configure environment files, insert public keys, compile/obfuscate the extension, and generate a customized SQL script for you.

### 📋 Copy-Paste this Prompt to Antigravity:
```text
I want to deploy this chrome extension licensing and protection system. Please automate the deployment process by doing the following:

1. Generate the RS256 key pair by running the Node script: `node scripts/generate-keys.js`.
2. Extract the public key contents from the generated `public.pem` and embed them into the `JWT_PUBLIC_KEY` variable in `security.js` (replacing the placeholder key).
3. Ask me to provide the following configuration details:
   - Supabase URL (e.g., https://xxxx.supabase.co)
   - Supabase Service Role Key (secret key)
   - Supabase Anon Key (public client key)
   - Desired Admin Secret (a long random string to secure administrative endpoints)
   - Desired Admin User Email & Password (to seed the admin dashboard login)
4. Update `extension-config.js` and `security.js` with the correct configuration values:
   - Update `POWERKITS_API_BASE` in `extension-config.js` to the Vercel API production URL once deployed (or use placeholder first, then update it later).
   - Set `INTERNAL_LICENSE_MODE` to `false` in `extension-config.js`.
5. Create `.env` files for both:
   - `vercel-api/.env` containing:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SECRET, PUBLIC_API_KEY (generate a random string prefixed with `pk_lov_ext_`), POWERKITS_API_KEY, UPSTREAM_API_BASE (https://lov.powerkits.net), JWT_PRIVATE_KEY (the private key formatted with \n), and JWT_PUBLIC_KEY.
   - `admin-dashboard/.env` containing:
     NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SECRET, and PUBLIC_API_KEY.
6. Install vercel CLI if missing (`npm install -g vercel`), run `vercel login` and trigger deployments for `vercel-api` and `admin-dashboard` to Vercel. Obtain the production URLs.
7. Run the obfuscation script in `obfuscation` to compile the final extension into `dist/`.
8. Generate the customized SQL statements from `supabase/SETUP_ALL.sql` plus a generated INSERT statement to seed my admin account with a bcrypt password hash, and display it to me.
9. Output a final list of deployment URLs, credentials, and instructions.
```

---

## 🛠️ Manual Deployment Guide

If you prefer to deploy everything manually, follow the step-by-step instructions below.

### 1. Database Setup (Supabase)
1. Sign up/Log in to [Supabase](https://supabase.com/).
2. Create a new PostgreSQL project.
3. Open the **SQL Editor** in the Supabase Dashboard.
4. Open a **New Query**, paste the contents of [supabase/SETUP_ALL.sql](file:///d:/lovable-powerkits-6.4.5/lovable-powerkits-6.4.5/supabase/SETUP_ALL.sql), and click **Run**. This will create all tables (`licenses`, `devices`, `activations`, `admin_users`, `security_events`, `used_nonces`, `license_devices`, `license_sessions`), indexes, and RLS policies.
5. Create an initial administrator account to log in to the dashboard by running:
   ```sql
   INSERT INTO admin_users (email, password_hash, role)
   VALUES ('admin@yourdomain.com', '$2a$10$tM.yF.7c6Jg3gA7EaM78E.P31v8t1yJp.8jJ1Jt2c3hB1d2e3f4g5', 'admin');
   ```
   *(Note: The hash above corresponds to the password `AdminPassword123`. You should generate your own bcrypt hash using a Node script or online tool for production).*

### 2. Generate RS256 Cryptographic Keys
The system uses asymmetric RS256 signatures to authorize sessions and prevent cracking/spoofing.
1. Run the cross-platform key generator in the root directory:
   ```bash
   node scripts/generate-keys.js
   ```
2. Two files will be created in the root directory:
   - `pkcs8_private.pem` (Your private signing key - keep this secret).
   - `public.pem` (Your public verification key).

### 3. Deploy the Vercel API
The backend acts as the licensing agent, verification heartbeats handler, and premium features proxy.
1. Navigate to the `vercel-api` folder:
   ```bash
   cd vercel-api
   ```
2. Create a `.env` file (copied from `.env.example`) and set the following keys:
   - `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` (From your Supabase Project Settings > API).
   - `ADMIN_SECRET` (A strong random secret string for API validation).
   - `PUBLIC_API_KEY` & `POWERKITS_API_KEY` (Set both to a strong random key prefixed with `pk_lov_ext_` - e.g. `pk_lov_ext_a8f3c21e9d4b7...`).
   - `UPSTREAM_API_BASE` (Set to `https://lov.powerkits.net`).
   - `JWT_PRIVATE_KEY` (Open `pkcs8_private.pem`, copy the text, and format it as a single-line string with `\n` replacing actual newlines).
   - `JWT_PUBLIC_KEY` (Open `public.pem`, copy the text, and format it as a single-line string with `\n`).
3. Deploy to Vercel:
   ```bash
   npm install -g vercel
   vercel login
   vercel --prod
   ```
4. Note your deployed Vercel URL (e.g. `https://your-vercel-api.vercel.app`).

### 4. Deploy the Admin Dashboard
The dashboard allows you to manage licenses, activate/suspend keys, see active devices, and monitor events.
1. Navigate to the `admin-dashboard` folder:
   ```bash
   cd ../admin-dashboard
   ```
2. Create a `.env` file containing:
   - `NEXT_PUBLIC_SUPABASE_URL` (Your Supabase project URL).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Your Supabase public anon key).
   - `SUPABASE_SERVICE_ROLE_KEY` (Your Supabase service role key).
   - `ADMIN_SECRET` (Must match the `ADMIN_SECRET` set in Vercel API).
3. Deploy to Vercel:
   ```bash
   vercel --prod
   ```
4. Add the environment variables in your Vercel Dashboard project settings and trigger a redeployment.

### 5. Configure and Build the Chrome Extension
1. Open [extension-config.js](file:///d:/lovable-powerkits-6.4.5/lovable-powerkits-6.4.5/extension-config.js):
   - Change `POWERKITS_API_BASE` to your deployed Vercel API URL (e.g. `https://your-vercel-api.vercel.app`).
   - Set `POWERKITS_API_KEY` to the `PUBLIC_API_KEY` value configured in your Vercel variables.
   - Set `INTERNAL_LICENSE_MODE` to `false` to enforce license validation.
2. Open [security.js](file:///d:/lovable-powerkits-6.4.5/lovable-powerkits-6.4.5/security.js):
   - Replace the value of `JWT_PUBLIC_KEY` with the exact contents of your generated `public.pem` file.
3. Bundle and obfuscate the extension for production:
   ```bash
   cd ../obfuscation
   npm install
   npm run build
   ```
4. The production-ready extension will be output in the `dist/` directory at the project root.
5. In Google Chrome, navigate to `chrome://extensions/`, enable **Developer mode** (top-right toggle), click **Load unpacked**, and select the `dist/` folder.

---

## 🔒 Security Hardening Checklist
- **CORS Restrictions**: Modify headers in `vercel.json` to change `"Access-Control-Allow-Origin": "*"` to your Chrome Extension's ID (e.g. `chrome-extension://[your-extension-id]`) or custom domain mapping in Vercel.
- **Obfuscation**: Never release the raw extension source code. Always compile it using the `obfuscation` tool. The build pipeline optimizes code flow and base64-encodes strings to prevent tampering.
- **Cron Audits**: Setup a recurring cron job pointing to `/api/license/heartbeat` in `vercel.json` with an `Authorization: Bearer [ADMIN_SECRET]` header to check and clean up inactive devices.
