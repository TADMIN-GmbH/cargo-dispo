-- Behebt den "infinite recursion" Fehler in der profiles-Tabelle
-- Ausführen in: Supabase Dashboard → SQL Editor → New query

-- Alte fehlerhafte Policy löschen
DROP POLICY IF EXISTS "Admins können alle Profile lesen" ON public.profiles;
DROP POLICY IF EXISTS "Eigenes Profil lesen" ON public.profiles;

-- Neue einfache Policy: alle eingeloggten Benutzer können Profile lesen
CREATE POLICY "Eingeloggte Benutzer können Profile lesen" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
