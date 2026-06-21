-- Migration to add used_nonces table for replay attack prevention
CREATE TABLE IF NOT EXISTS used_nonces (
    nonce VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index on created_at for fast cleanup of expired nonces
CREATE INDEX IF NOT EXISTS idx_used_nonces_created_at ON used_nonces(created_at);
