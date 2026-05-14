-- Create customer_locations table
CREATE TABLE customer_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  street text,
  zip text,
  city text,
  contact_person text,
  phone text,
  email text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users can manage locations" ON customer_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add location FK to tours
ALTER TABLE tours ADD COLUMN IF NOT EXISTS customer_location_id uuid REFERENCES customer_locations(id) ON DELETE SET NULL;

-- Migrate existing duplicate Hergarten GmbH entries into one customer with two locations
-- Keep Neuss (40ce8588) as main customer, Dortmund (1d16066f) as duplicate to be removed

-- Insert Neuss location under main customer
INSERT INTO customer_locations (customer_id, name, street, zip, city, contact_person, phone, email)
VALUES (
  '40ce8588-8859-4a84-8626-272466a098b6',
  'Neuss',
  'Rampenstraße 2', '41472', 'Neuss',
  'Heiko Hellen', '02131/314022-29', 'h.hellen@stahlspedition.de'
);

-- Insert Dortmund location under main customer
INSERT INTO customer_locations (customer_id, name, street, zip, city, contact_person, phone, email)
VALUES (
  '40ce8588-8859-4a84-8626-272466a098b6',
  'Dortmund',
  'Heinrich-August-Schulte-Straße 6', '44147', 'Dortmund',
  'Volkan Keser', '0152-24476254', 'v.keser@stahlspedition.de'
);

-- Assign existing Neuss tours to the Neuss location
UPDATE tours
SET customer_location_id = (
  SELECT id FROM customer_locations
  WHERE customer_id = '40ce8588-8859-4a84-8626-272466a098b6' AND name = 'Neuss'
)
WHERE customer_id = '40ce8588-8859-4a84-8626-272466a098b6';

-- Move Dortmund tours to main customer + assign Dortmund location
UPDATE tours
SET customer_id = '40ce8588-8859-4a84-8626-272466a098b6',
    customer_location_id = (
      SELECT id FROM customer_locations
      WHERE customer_id = '40ce8588-8859-4a84-8626-272466a098b6' AND name = 'Dortmund'
    )
WHERE customer_id = '1d16066f-f09b-4f36-93b9-3d7f22a07df9';

-- Delete duplicate Hergarten Dortmund customer (tours and aliases already migrated above)
DELETE FROM customers WHERE id = '1d16066f-f09b-4f36-93b9-3d7f22a07df9';
