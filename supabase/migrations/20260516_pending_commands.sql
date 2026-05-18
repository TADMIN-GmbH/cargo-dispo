CREATE TABLE IF NOT EXISTS pending_whatsapp_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  action text NOT NULL,
  resolved jsonb DEFAULT '{}',
  pending_field text,
  options jsonb,
  original_transcript text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '30 minutes'
);
ALTER TABLE pending_whatsapp_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service full access" ON pending_whatsapp_commands USING (true) WITH CHECK (true);
