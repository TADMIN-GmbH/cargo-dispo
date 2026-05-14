-- Soft-delete / archive support for drivers, customers, vehicles
ALTER TABLE drivers   ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE vehicles  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
