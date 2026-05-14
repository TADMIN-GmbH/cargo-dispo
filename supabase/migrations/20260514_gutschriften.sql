CREATE TABLE gutschriften (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gutschrift_nr text,
  document_date date,
  absender text,
  file_path text,
  file_name text,
  netto_gesamt numeric(10,2),
  mwst numeric(10,2),
  brutto_gesamt numeric(10,2),
  extracted_by_ai boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE gutschrift_positionen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gutschrift_id uuid REFERENCES gutschriften(id) ON DELETE CASCADE,
  bel_datum date,
  kennzeichen text,
  tour_nr text,
  auftrag_nr text,
  kg numeric(10,3),
  netto_betrag numeric(10,2),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE gutschriften ENABLE ROW LEVEL SECURITY;
ALTER TABLE gutschrift_positionen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can manage gutschriften" ON gutschriften FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can manage positionen" ON gutschrift_positionen FOR ALL TO authenticated USING (true) WITH CHECK (true);
