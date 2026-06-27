-- Migration to add admin_message and support_url columns to licenses table
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS admin_message TEXT DEFAULT '';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS support_url TEXT DEFAULT '';
