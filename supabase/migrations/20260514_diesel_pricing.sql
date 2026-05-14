-- Diesel price history (fetched from en2x.de monthly)
CREATE TABLE IF NOT EXISTS diesel_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE,          -- first day of month: 2026-02-01
  price_brutto numeric NOT NULL,       -- brutto price from en2x.de
  price_netto numeric NOT NULL,        -- price_brutto / 1.19
  fetched_at timestamptz DEFAULT now(),
  source_url text DEFAULT 'https://en2x.de/service/statistiken/verbraucherpreise/',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE diesel_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_diesel_prices" ON diesel_prices FOR ALL TO authenticated USING (true);

-- Customer pricing models (per vehicle type, with valid_from; latest row wins)
CREATE TABLE IF NOT EXISTS customer_pricing_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_type text NOT NULL,          -- "MW 12t", "MW 15t", "MW 18t", "MW 26t", "SZM"
  km_class text,                       -- null | '300km' | '450km' (for SZM differentiation)
  daily_rate_netto numeric NOT NULL,   -- base daily rate netto, e.g. 455.00
  maut_flat numeric NOT NULL DEFAULT 0, -- flat toll, e.g. 72.59
  diesel_base_price numeric NOT NULL DEFAULT 1.04, -- reference diesel base price
  diesel_factor numeric NOT NULL DEFAULT 20, -- % of % increase, e.g. 20
  valid_from date NOT NULL,            -- effective from this date
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_pricing_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_pricing_models" ON customer_pricing_models FOR ALL TO authenticated USING (true);

-- Add km_class to vehicles (only relevant for SZM type)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS km_class text; -- null | '300km' | '450km'

-- Add soll_netto to gutschrift_positionen for Soll-Ist comparison
ALTER TABLE gutschrift_positionen ADD COLUMN IF NOT EXISTS soll_netto numeric;

-- Seed historical diesel prices (Jan–May 2026 from en2x.de)
-- Prices used for billing with 2-month lag:
-- March billing → January price, April billing → February price, etc.
INSERT INTO diesel_prices (month, price_brutto, price_netto) VALUES
  ('2025-11-01', 1.6515, ROUND(1.6515 / 1.19, 4)),
  ('2025-12-01', 1.6111, ROUND(1.6111 / 1.19, 4)),
  ('2026-01-01', 1.7077, ROUND(1.7077 / 1.19, 4)),
  ('2026-02-01', 1.7359, ROUND(1.7359 / 1.19, 4)),
  ('2026-03-01', 2.1338, ROUND(2.1338 / 1.19, 4)),
  ('2026-04-01', 2.1338, ROUND(2.1338 / 1.19, 4))
ON CONFLICT (month) DO NOTHING;
