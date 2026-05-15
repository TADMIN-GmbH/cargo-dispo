-- Fuel invoices (one per CSV upload / billing period)
CREATE TABLE IF NOT EXISTS fuel_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id text NOT NULL,          -- e.g. "DE25040976"
  internal_id text NOT NULL,         -- e.g. "25041822"
  invoice_date date NOT NULL,
  invoice_due_date date,
  total_net numeric,
  total_gross numeric,
  pdf_url text,
  csv_url text,
  created_at timestamptz DEFAULT now()
);

-- Individual fuel transactions (parsed from CSV rows)
CREATE TABLE IF NOT EXISTS fuel_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_invoice_id uuid REFERENCES fuel_invoices(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  license_plate_raw text,            -- original value from CSV
  transaction_date date NOT NULL,
  product text NOT NULL,             -- "Diesel" | "AdBlue"
  quantity_liters numeric,
  price_per_liter numeric,
  total_net numeric,
  total_gross numeric,
  place_of_delivery text,
  driver_name text,
  created_at timestamptz DEFAULT now()
);

-- Maut invoices (one per billing period)
CREATE TABLE IF NOT EXISTS maut_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  total_net numeric,
  total_gross numeric,
  pdf_url text,
  csv_url text,
  created_at timestamptz DEFAULT now()
);

-- Individual maut transactions (parsed from Einzelfahrtennachweis CSV)
CREATE TABLE IF NOT EXISTS maut_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maut_invoice_id uuid REFERENCES maut_invoices(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  license_plate_raw text,
  transaction_date date NOT NULL,
  total_net numeric,
  total_gross numeric,
  route_description text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE fuel_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE maut_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE maut_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users" ON fuel_invoices FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users" ON fuel_transactions FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users" ON maut_invoices FOR ALL TO authenticated USING (true);
CREATE POLICY "Authenticated users" ON maut_transactions FOR ALL TO authenticated USING (true);
