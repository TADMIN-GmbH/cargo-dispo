CREATE TABLE customer_vehicle_aliases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  alias text NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_vehicle_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users can manage aliases" ON customer_vehicle_aliases FOR ALL TO authenticated USING (true) WITH CHECK (true);
