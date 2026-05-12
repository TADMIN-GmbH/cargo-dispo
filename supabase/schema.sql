-- CargoKöhler Disposition — Datenbank Schema
-- Ausführen in: Supabase Dashboard → SQL Editor

-- ===== PROFILE TABELLE =====
-- Wird automatisch beim User-Erstellen befüllt
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS aktivieren
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigenes Profil lesen" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins können alle Profile lesen" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Eigenes Profil bearbeiten" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Automatisch Profil erstellen wenn neuer User registriert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===== FAHRZEUGE =====
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  license_plate TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'on_tour', 'maintenance', 'inactive')),
  current_driver_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authentifizierte Benutzer können Fahrzeuge lesen" ON public.vehicles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authentifizierte Benutzer können Fahrzeuge bearbeiten" ON public.vehicles
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ===== FAHRER =====
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  license_class TEXT,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'on_tour', 'off', 'sick')),
  current_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vehicles
  ADD CONSTRAINT fk_vehicle_driver
  FOREIGN KEY (current_driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authentifizierte Benutzer können Fahrer lesen" ON public.drivers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authentifizierte Benutzer können Fahrer bearbeiten" ON public.drivers
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ===== KUNDEN =====
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  street TEXT,
  zip TEXT,
  city TEXT,
  country TEXT DEFAULT 'Deutschland',
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authentifizierte Benutzer können Kunden lesen" ON public.customers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authentifizierte Benutzer können Kunden bearbeiten" ON public.customers
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ===== TOUREN =====
CREATE TABLE IF NOT EXISTS public.tours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_date DATE NOT NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
  pickup_address TEXT,
  delivery_address TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authentifizierte Benutzer können Touren lesen" ON public.tours
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authentifizierte Benutzer können Touren bearbeiten" ON public.tours
  FOR ALL USING (auth.uid() IS NOT NULL);


-- ===== WHATSAPP LOGS =====
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_number TEXT NOT NULL,
  transcript TEXT NOT NULL,
  parsed_action JSONB,
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins können WhatsApp-Logs lesen" ON public.whatsapp_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service-Role kann Logs schreiben" ON public.whatsapp_logs
  FOR INSERT WITH CHECK (TRUE);


-- ===== EINLADUNGEN =====
CREATE TABLE IF NOT EXISTS public.invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  accepted BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins können Einladungen verwalten" ON public.invites
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ===== BEISPIELDATEN (optional, zum Testen) =====
-- Fahrzeuge
INSERT INTO public.vehicles (license_plate, type, brand, model, year, status) VALUES
  ('HH-CK 001', 'LKW 7,5t', 'Mercedes-Benz', 'Atego', 2021, 'available'),
  ('HH-CK 002', 'LKW 12t', 'MAN', 'TGL', 2020, 'available'),
  ('HH-CK 003', 'Sprinter', 'Mercedes-Benz', 'Sprinter 519', 2022, 'available'),
  ('HH-CK 004', 'LKW 18t', 'Volvo', 'FE', 2019, 'on_tour'),
  ('HH-CK 005', 'Transporter', 'Volkswagen', 'Crafter', 2023, 'available')
ON CONFLICT DO NOTHING;

-- Kunden
INSERT INTO public.customers (company_name, contact_person, street, zip, city, phone) VALUES
  ('Müller Logistik GmbH', 'Hans Müller', 'Industriestraße 12', '20537', 'Hamburg', '+49 40 123456'),
  ('Bauer AG', 'Petra Bauer', 'Hafenweg 5', '28195', 'Bremen', '+49 421 654321'),
  ('Schmidt & Söhne', 'Karl Schmidt', 'Hauptstraße 88', '22765', 'Hamburg', '+49 40 987654'),
  ('Nord Transport GmbH', 'Anna Nord', 'Speicherstraße 3', '20095', 'Hamburg', NULL)
ON CONFLICT DO NOTHING;
