-- License system v2: customer fields, license_devices, license_sessions
-- Run in Supabase SQL Editor after init_licensing migration

-- Extend licenses table
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS plan VARCHAR(100);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Backfill plan from plan_name
UPDATE licenses SET plan = plan_name WHERE plan IS NULL AND plan_name IS NOT NULL;
UPDATE licenses SET updated_at = created_at WHERE updated_at IS NULL;

-- license_devices: per-device activation tracking
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

-- license_sessions: hashed JWT session tokens
CREATE TABLE IF NOT EXISTS license_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_license_devices_license_id ON license_devices(license_id);
CREATE INDEX IF NOT EXISTS idx_license_devices_device_id ON license_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_license_sessions_token_hash ON license_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_license_sessions_license_id ON license_sessions(license_id);

ALTER TABLE license_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_license_devices') THEN
    CREATE POLICY service_role_license_devices ON license_devices FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_license_sessions') THEN
    CREATE POLICY service_role_license_sessions ON license_sessions FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- Migrate legacy devices rows into license_devices (one-time)
INSERT INTO license_devices (license_id, device_id, device_name, ip_address, activated_at, last_seen_at)
SELECT d.license_id, d.device_hash, 'Migrated Device', d.ip_address, d.first_seen, d.last_seen
FROM devices d
WHERE NOT EXISTS (
  SELECT 1 FROM license_devices ld
  WHERE ld.license_id = d.license_id AND ld.device_id = d.device_hash
);
