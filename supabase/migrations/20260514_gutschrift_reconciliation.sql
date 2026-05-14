-- Period-based Gutschrift reconciliation support
-- Some customers bill per vehicle × days in a period instead of per-tour line items

CREATE TABLE IF NOT EXISTS gutschrift_vehicle_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gutschrift_id uuid NOT NULL REFERENCES gutschriften(id) ON DELETE CASCADE,
  license_plate text NOT NULL,        -- normalized with spaces: "HAM CK 523"
  period_from date,
  period_to date,
  days_claimed integer,               -- as stated in Gutschrift
  daily_rate numeric,                 -- e.g. 495.00
  netto_subtotal numeric,             -- days_claimed * daily_rate
  diesel_pct numeric,                 -- e.g. 7.51
  diesel_amount numeric,              -- allocated diesel share for this vehicle
  days_found integer,                 -- filled in after reconciliation
  match_status text DEFAULT 'pending', -- pending | matched | conflict | accepted
  created_at timestamptz DEFAULT now()
);

ALTER TABLE gutschrift_vehicle_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_vehicle_entries" ON gutschrift_vehicle_entries
  FOR ALL TO authenticated USING (true);

-- Extend positionen with reconciliation fields
ALTER TABLE gutschrift_positionen
  ADD COLUMN IF NOT EXISTS tour_id uuid REFERENCES tours(id),
  ADD COLUMN IF NOT EXISTS vehicle_entry_id uuid REFERENCES gutschrift_vehicle_entries(id),
  ADD COLUMN IF NOT EXISTS daily_rate numeric,
  ADD COLUMN IF NOT EXISTS diesel_amount numeric,
  ADD COLUMN IF NOT EXISTS match_status text DEFAULT 'matched';
  -- match_status values: matched | extra_in_db | missing_in_db | accepted

-- Extend gutschriften header
ALTER TABLE gutschriften
  ADD COLUMN IF NOT EXISTS billing_type text DEFAULT 'per_tour',
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date,
  ADD COLUMN IF NOT EXISTS reconciliation_status text DEFAULT 'none';
  -- reconciliation_status: none | pending | ok | conflict
