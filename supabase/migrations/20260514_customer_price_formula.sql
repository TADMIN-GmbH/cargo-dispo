ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS price_daily_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_diesel_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS price_toll_flat numeric(10,2);
