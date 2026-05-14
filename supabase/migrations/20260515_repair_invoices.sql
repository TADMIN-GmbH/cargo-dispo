ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine_oil_capacity_liters numeric;

CREATE TABLE IF NOT EXISTS repair_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id),
  license_plate text, -- for unmatched plates
  invoice_date date,
  supplier text,
  invoice_number text,
  amount_netto numeric,
  amount_brutto numeric,
  km_reading integer,
  file_path text,
  file_name text,
  line_items jsonb DEFAULT '[]',
  ai_anomalies jsonb DEFAULT '[]',
  ai_status text DEFAULT 'pending', -- pending, ok, warning, alert
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE repair_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage repair_invoices" ON repair_invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
