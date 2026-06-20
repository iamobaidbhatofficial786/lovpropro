-- Supabase PostgreSQL Schema for Chrome Extension Licensing and Protection System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: licenses
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash of the key
    plan_name VARCHAR(100) NOT NULL,              -- e.g. "1 Device Plan", "3 Device Plan", "Unlimited"
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'revoked', 'expired'
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

-- Table: devices
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE NOT NULL,
    device_hash VARCHAR(64) NOT NULL,            -- Stable hardware fingerprint hash
    browser_fingerprint JSONB,                    -- Extensible JSON storing userAgent, languages, etc.
    ip_address VARCHAR(45),                       -- Supports IPv4 & IPv6
    country VARCHAR(100),                         -- GeoIP country
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'blocked'
    UNIQUE(license_id, device_hash)
);

-- Table: activations
CREATE TABLE IF NOT EXISTS activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,                  -- 'activate', 'deactivate', 'heartbeat', 'verify'
    ip_address VARCHAR(45),
    country VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: admin_users
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',    -- 'admin', 'reseller'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: security_events
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,             -- 'tampering', 'abuse', 'rate_limit_exceeded', 'suspicious_device'
    details JSONB,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance optimizations
CREATE INDEX IF NOT EXISTS idx_licenses_key_hash ON licenses(license_key_hash);
CREATE INDEX IF NOT EXISTS idx_devices_license_id ON devices(license_id);
CREATE INDEX IF NOT EXISTS idx_devices_hash ON devices(device_hash);
CREATE INDEX IF NOT EXISTS idx_activations_license_id ON activations(license_id);
CREATE INDEX IF NOT EXISTS idx_activations_created_at ON activations(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_license_id ON security_events(license_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);

-- Row Level Security (RLS) policies or defaults (disable for serverless context or enforce service role access)
-- Typically Vercel endpoints will connect via service_role to bypass RLS, which is standard for admin microservices.
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Allow full access to authenticated service_role
CREATE POLICY service_role_access ON licenses FOR ALL TO service_role USING (true);
CREATE POLICY service_role_access ON devices FOR ALL TO service_role USING (true);
CREATE POLICY service_role_access ON activations FOR ALL TO service_role USING (true);
CREATE POLICY service_role_access ON admin_users FOR ALL TO service_role USING (true);
CREATE POLICY service_role_access ON security_events FOR ALL TO service_role USING (true);
