-- =============================================================================
-- RUN THIS ENTIRE SCRIPT in Supabase → SQL Editor → New query → Run
-- Project: zzghxrwfulgfuxylczrv
-- =============================================================================

-- Migration 1: Core licensing tables
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key_hash VARCHAR(64) UNIQUE NOT NULL,
    plan_name VARCHAR(100) NOT NULL DEFAULT 'pro',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    suspended BOOLEAN NOT NULL DEFAULT FALSE,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expired BOOLEAN NOT NULL DEFAULT FALSE,
    max_devices INTEGER NOT NULL DEFAULT 1,
    activation_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE NOT NULL,
    device_hash VARCHAR(128) NOT NULL,
    browser_fingerprint JSONB,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    UNIQUE(license_id, device_hash)
);

CREATE TABLE IF NOT EXISTS activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS used_nonces (
    nonce VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS admin_message TEXT DEFAULT '';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS support_url TEXT DEFAULT '';

UPDATE licenses SET plan = plan_name WHERE plan IS NULL AND plan_name IS NOT NULL;
UPDATE licenses SET updated_at = created_at WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS license_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    device_name VARCHAR(255),
    user_agent TEXT,
    ip_address VARCHAR(45),
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(license_id, device_id)
);

CREATE TABLE IF NOT EXISTS license_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_licenses_key_hash ON licenses(license_key_hash);
CREATE INDEX IF NOT EXISTS idx_devices_license_id ON devices(license_id);
CREATE INDEX IF NOT EXISTS idx_license_devices_license_id ON license_devices(license_id);
CREATE INDEX IF NOT EXISTS idx_license_sessions_token_hash ON license_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_used_nonces_created_at ON used_nonces(created_at);

-- RLS + service role access
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_access ON licenses;
CREATE POLICY service_role_access ON licenses FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS service_role_access ON devices;
CREATE POLICY service_role_access ON devices FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS service_role_access ON activations;
CREATE POLICY service_role_access ON activations FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS service_role_access ON admin_users;
CREATE POLICY service_role_access ON admin_users FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS service_role_access ON security_events;
CREATE POLICY service_role_access ON security_events FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS service_role_license_devices ON license_devices;
CREATE POLICY service_role_license_devices ON license_devices FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS service_role_license_sessions ON license_sessions;
CREATE POLICY service_role_license_sessions ON license_sessions FOR ALL TO service_role USING (true);
