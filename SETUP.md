# CargoKöhler Dispo — Einrichtungsanleitung

## Übersicht
Das Portal läuft auf drei kostenlosen Diensten:
- **Vercel** → Hosting der Webseite (kostenlos)
- **Supabase** → Datenbank + Login (kostenlos bis 500 MB)
- **Twilio** → WhatsApp Integration (kostenlos Sandbox)
- **OpenAI** → Sprachtranskription + KI-Parsing (~0,01€ pro Nachricht)

---

## Schritt 1: Supabase Datenbank einrichten

### 1.1 Account erstellen
1. Gehe zu **https://app.supabase.com**
2. „Start your project" → Mit GitHub oder E-Mail anmelden
3. „New project" → Name: `cargo-dispo`, Region: Frankfurt (eu-central-1)
4. Ein Datenbankpasswort vergeben und merken

### 1.2 Datenbank-Schema einrichten
1. Im Supabase Dashboard: linke Seite → **SQL Editor**
2. Klicke auf „New query"
3. Öffne die Datei `supabase/schema.sql` aus dem Projektordner
4. Kopiere den gesamten Inhalt und füge ihn im SQL Editor ein
5. Klicke auf **Run** (▶)
6. Erfolgsmeldung abwarten

### 1.3 API-Keys kopieren
1. Im Supabase Dashboard: **Project Settings → API**
2. Notiere dir:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** Key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 1.4 Ersten Admin-Benutzer anlegen
1. Im Supabase Dashboard: **Authentication → Users**
2. Klicke auf „Add user" → „Create new user"
3. E-Mail und Passwort eingeben
4. Nach dem Erstellen: **SQL Editor** öffnen, folgendes ausführen:
   ```sql
   UPDATE public.profiles 
   SET role = 'admin', full_name = 'Dein Name'
   WHERE id = 'DEINE-USER-ID';
   ```
   (Die User-ID findest du in Authentication → Users)

---

## Schritt 2: Twilio WhatsApp Sandbox

### 2.1 Account erstellen
1. Gehe zu **https://www.twilio.com**
2. „Sign up" → Kostenloses Konto
3. Telefonnummer verifizieren (normale Handynummer reicht)

### 2.2 WhatsApp Sandbox aktivieren
1. Im Twilio Dashboard: **Messaging → Try it out → Send a WhatsApp message**
2. Du siehst eine Twilio-Nummer (meistens +1 415 523 8886) und einen Join-Code
3. Schicke von deiner WhatsApp die Nachricht: `join [dein-code]` an diese Nummer
4. Du bist jetzt in der Sandbox registriert

### 2.3 Webhook konfigurieren (nach Vercel-Deployment)
1. Im Twilio Dashboard: **Messaging → Settings → WhatsApp Sandbox Settings**
2. Bei „When a message comes in": deine Vercel-URL + `/api/whatsapp/webhook`
   Beispiel: `https://cargo-dispo.vercel.app/api/whatsapp/webhook`

### 2.4 API-Keys kopieren
Im Twilio Dashboard (Startseite):
- **Account SID** → `TWILIO_ACCOUNT_SID`
- **Auth Token** → `TWILIO_AUTH_TOKEN`
- Die Sandbox-Nummer (z.B. +14155238886) → `TWILIO_WHATSAPP_FROM`

---

## Schritt 3: OpenAI API Key

1. Gehe zu **https://platform.openai.com/api-keys**
2. Anmelden / Konto erstellen
3. „Create new secret key" → Key kopieren → `OPENAI_API_KEY`
4. Mindestguthaben aufladen (5€ reichen für ca. 500 Sprachbefehle)

---

## Schritt 4: Vercel Deployment

### 4.1 Vercel Account erstellen
1. Gehe zu **https://vercel.com**
2. „Sign up" → Mit GitHub anmelden (empfohlen)

### 4.2 Projekt deployen (Terminal)
```bash
cd cargo-dispo
vercel
```
- „Set up and deploy?" → Y
- „Which scope?" → Deinen Account wählen
- „Link to existing project?" → N
- „What's your project's name?" → cargo-dispo
- „In which directory is your code located?" → ./
- Warte auf Deployment

### 4.3 Umgebungsvariablen setzen
Im Vercel Dashboard → dein Projekt → **Settings → Environment Variables**:

| Name | Wert |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Von Supabase (Schritt 1.3) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Von Supabase (Schritt 1.3) |
| `NEXT_PUBLIC_APP_URL` | Deine Vercel URL (z.B. https://cargo-dispo.vercel.app) |
| `TWILIO_ACCOUNT_SID` | Von Twilio (Schritt 2.4) |
| `TWILIO_AUTH_TOKEN` | Von Twilio (Schritt 2.4) |
| `TWILIO_WHATSAPP_FROM` | +14155238886 |
| `OPENAI_API_KEY` | Von OpenAI (Schritt 3) |

Nach dem Setzen der Variablen: **Deployments → Redeploy**

### 4.4 Finales Deployment
```bash
vercel --prod
```

---

## Schritt 5: Twilio Webhook aktualisieren

Jetzt hast du deine finale URL. Gehe zurück zu:
**Twilio → Messaging → WhatsApp Sandbox Settings**
Trage die finale URL ein: `https://DEINE-URL.vercel.app/api/whatsapp/webhook`

---

## WhatsApp Sprachbefehle testen

Schicke eine Sprachnachricht (oder Textnachricht) an die Twilio-Nummer:

✅ **Funktioniert:**
- "Fahrer Müller mit Kennzeichen HH-XY 123 fährt morgen zu Kunde ABC GmbH"
- "Schmidt fährt heute zu Nord Transport, Fahrzeug HH-CK 004"
- "Bitte lege eine Tour an für übermorgen: Weber zu Müller Logistik"

❌ **Noch nicht verfügbar (für später):**
- Status-Updates von Touren per Sprache
- Mehrstufige Dialoge

---

## Updates deployen

Nach Änderungen am Code:
```bash
cd cargo-dispo
vercel --prod
```

---

## Kontakt & Support
Das Portal wurde speziell für CargoKöhler gebaut.
Für Änderungen und Erweiterungen: Weiter in Claude Code arbeiten.
