-- Add soll_netto to tours table
ALTER TABLE tours ADD COLUMN IF NOT EXISTS soll_netto numeric;
