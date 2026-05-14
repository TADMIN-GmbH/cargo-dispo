-- BGL diesel prices (fetched from bgl-ev.de monthly, without USt)
CREATE TABLE IF NOT EXISTS bgl_diesel_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE,        -- first day of month: 2026-03-01
  price_netto numeric NOT NULL,      -- EUR / 100 Liter ohne USt (BGL Großverbraucher)
  fetched_at timestamptz DEFAULT now(),
  source_url text DEFAULT 'https://www.bgl-ev.de/wp-content/uploads/simple-file-list/Dieselpreisinformationen/dieselpreisinfo-grossverbraucher.pdf',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bgl_diesel_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_bgl_diesel_prices" ON bgl_diesel_prices FOR ALL TO authenticated USING (true);

-- BGL floater step table (shared across all customers using BGL source)
CREATE TABLE IF NOT EXISTS bgl_floater_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_from numeric NOT NULL,   -- €/100L lower bound (inclusive)
  price_to   numeric NOT NULL,   -- €/100L upper bound (inclusive)
  surcharge_pct numeric NOT NULL -- e.g. 18.5 means +18.5%
);
ALTER TABLE bgl_floater_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_bgl_floater_steps" ON bgl_floater_steps FOR ALL TO authenticated USING (true);

-- Extend customer_pricing_models with new fields
ALTER TABLE customer_pricing_models
  ADD COLUMN IF NOT EXISTS accessory_flat  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diesel_source   text    NOT NULL DEFAULT 'en2x',  -- 'en2x' | 'bgl'
  ADD COLUMN IF NOT EXISTS diesel_lag_months int   NOT NULL DEFAULT 2,       -- 1 or 2
  ADD COLUMN IF NOT EXISTS floater_type    text    NOT NULL DEFAULT 'formula'; -- 'formula' | 'table'

-- Seed BGL historical prices (EUR / 100 Liter ohne USt, from BGL PDF)
INSERT INTO bgl_diesel_prices (month, price_netto) VALUES
  ('2025-01-01', 133.73),
  ('2025-02-01', 130.77),
  ('2025-03-01', 123.91),
  ('2025-04-01', 121.11),
  ('2025-05-01', 120.13),
  ('2025-06-01', 124.47),
  ('2025-07-01', 125.70),
  ('2025-08-01', 120.82),
  ('2025-09-01', 123.41),
  ('2025-10-01', 121.68),
  ('2025-11-01', 128.78),
  ('2025-12-01', 121.31),
  ('2026-01-01', 133.08),
  ('2026-02-01', 133.36),
  ('2026-03-01', 172.25)
ON CONFLICT (month) DO NOTHING;

-- Seed BGL floater step table
INSERT INTO bgl_floater_steps (price_from, price_to, surcharge_pct) VALUES
  ( 76.14,  80.09, -5.5),
  ( 80.10,  84.05, -4.5),
  ( 84.06,  88.01, -3.5),
  ( 88.02,  91.97, -2.5),
  ( 91.98,  95.93, -1.5),
  ( 95.94, 104.06,  0.0),
  (104.07, 108.02,  1.5),
  (108.03, 111.98,  2.5),
  (111.99, 115.94,  3.5),
  (115.95, 119.90,  4.5),
  (119.91, 123.86,  5.5),
  (123.87, 127.82,  6.5),
  (127.83, 131.78,  7.5),
  (131.79, 135.74,  8.5),
  (135.75, 139.70,  9.5),
  (139.71, 143.66, 10.5),
  (143.67, 147.62, 11.5),
  (147.63, 151.58, 12.5),
  (151.59, 155.54, 13.5),
  (155.55, 159.50, 14.5),
  (159.51, 163.46, 15.5),
  (163.47, 167.42, 16.5),
  (167.43, 171.38, 17.5),
  (171.39, 175.34, 18.5),
  (175.35, 179.30, 19.5),
  (179.31, 183.26, 20.5),
  (183.27, 187.22, 21.5),
  (187.23, 191.18, 22.5),
  (191.19, 195.14, 23.5),
  (195.15, 199.10, 24.5),
  (199.11, 203.06, 25.5)
ON CONFLICT DO NOTHING;
