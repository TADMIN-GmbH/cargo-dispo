-- Free km + extra km rate per pricing model
ALTER TABLE customer_pricing_models
  ADD COLUMN IF NOT EXISTS free_km       int     NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS extra_km_rate numeric NOT NULL DEFAULT 0;

-- Fleet vs. per-vehicle km billing per customer
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS km_billing_type text NOT NULL DEFAULT 'per_vehicle'; -- 'per_vehicle' | 'fleet'

-- Actual km driven per tour (filled manually or via telematics)
ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS actual_km numeric;
