# cargo-dispo — Architektur-Dokumentation

## Stack

| Schicht | Technologie |
|---------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Hosting | Vercel (`cargokoehler-dispo.vercel.app`) |
| Datenbank | Supabase (PostgreSQL + Auth + Storage) |
| Styling | Tailwind CSS + shadcn/ui |
| WhatsApp | Twilio Sandbox |
| KI | OpenAI: Whisper (Transkription), GPT-4o-mini (Intent-Parsing) |
| PDF-Parser | pdf-parse (BGL Dieselpreise) |

---

## Portale (Route Groups)

Das Projekt hat zwei getrennte Portal-Bereiche mit eigenem Layout und Akzentfarbe:

| Portal | Route Group | URL | Akzentfarbe |
|--------|-------------|-----|-------------|
| Dispo (Hauptportal) | `(dashboard)` | `/` | Blau |
| Fuhrpark | `(fuhrpark)` | `/fuhrpark/...` | Orange |
| Werkstatt (extern) | — | `https://werkstatt-web.vercel.app/dashboard` | Grün |

Der Portal-Wechsler sitzt in `src/components/layout/portal-switcher.tsx`.  
Die Portal-Definitionen (ID, Label, Icon, Farbe, `external: true/false`) stehen in `src/lib/portals.ts`.  
Der aktive Portal-Kontext wird über `src/lib/portal-context.tsx` (React Context) bereitgestellt.

---

## Seiten-Übersicht

### (dashboard) — Dispo-Portal

| Seite | Datei | Beschreibung |
|-------|-------|-------------|
| Dashboard | `(dashboard)/page.tsx` | Tagesübersicht, TODO-Widget, Action-Empfehlungen |
| Touren | `(dashboard)/tours/page.tsx` | Tour-Planer, Rollkarten-Status |
| Fahrer | `(dashboard)/drivers/page.tsx` | Fahrerliste, WhatsApp-Status, Farb-Indikatoren |
| Fahrzeuge | `(dashboard)/trucks/page.tsx` | Fahrzeugliste |
| Kunden | `(dashboard)/customers/page.tsx` | Kundenliste |
| Gutschriften | `(dashboard)/gutschriften/page.tsx` | PDF-Upload, Rechnungsabgleich |
| KM-Auswertung | `(dashboard)/km-auswertung/page.tsx` | Kilometerauswertung |
| WhatsApp | `(dashboard)/whatsapp/page.tsx` | WhatsApp-Log, Befehlsübersicht |
| Team | `(dashboard)/team/page.tsx` | Team-Verwaltung |
| Settings | `(dashboard)/settings/page.tsx` | Portal-Einstellungen |
| Reparaturen | `(dashboard)/reparaturen/page.tsx` | Reparaturrechnungen (Dispo-Sicht) |

### (fuhrpark) — Fuhrpark-Portal

| Seite | Datei | Beschreibung |
|-------|-------|-------------|
| Übersicht | `(fuhrpark)/fuhrpark/page.tsx` | Upload-Center (Kraft­stoff, Maut-CSV) |
| Kostenanalyse | `(fuhrpark)/fuhrpark/kosten/page.tsx` | Monatsübersicht: Kraftstoff + Maut + Reparaturen |
| Reparaturen | `(fuhrpark)/fuhrpark/reparaturen/page.tsx` | Reparaturrechnungen (Fuhrpark-Sicht) |

---

## Kritische Architektur-Regeln

### 1. ALLE API-Routen brauchen `force-dynamic`

```ts
export const dynamic = "force-dynamic"; // MUSS ganz oben stehen
```

Next.js 16 + Turbopack versucht API-Routen beim Build statisch zu rendern.
Ohne `force-dynamic` bricht der Build mit `supabaseKey is required` oder ähnlichem.

### 2. Supabase NIEMALS auf Modulebene initialisieren

**Falsch (bricht den Build):**
```ts
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...); // ❌
```

**Richtig (immer innerhalb der Handler-Funktion):**
```ts
function makeSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET() {
  const supabase = makeSupabase(); // ✅
  ...
}
```

### 3. Supabase Joins geben Arrays zurück

Supabase gibt bei `.select("vehicle:vehicles(...)")` manchmal ein Array statt ein Objekt zurück.
Immer normalisieren:

```ts
const vehicle = Array.isArray(r.vehicle) ? r.vehicle[0] ?? null : r.vehicle;
```

---

## WhatsApp Webhook — Ablauf

Datei: `src/app/api/whatsapp/webhook/route.ts`

```
Eingehende WhatsApp-Nachricht (Twilio POST)
  │
  ├─ Twilio Signatur-Validierung (nur production)
  │
  ├─ Transkription (Whisper, falls Sprachnachricht)
  │
  ├─ "OK" Filter (Twilio sendet automatisch "OK" — ignorieren)
  │
  ├─ STEP 1: Admin-Check (isAdminSender)  ← WICHTIG: ZUERST prüfen!
  │    │
  │    ├─ KEIN Admin → Driver-Flow
  │    │    ├─ Fahrer in DB gefunden?
  │    │    │    ├─ join <code>? → whatsapp_joined_at setzen, ✅-Antwort
  │    │    │    ├─ Offene Rollkarte heute? → Rollkarten-Dialog
  │    │    │    └─ Keine offenen Touren → Hinweistext
  │    │    └─ Unbekannte Nummer → Ablehnung
  │    │
  │    └─ Admin → Admin-Flow
  │         ├─ STEP 2: join <code>? → Driver-Record updaten
  │         ├─ STEP 3: Pending Clarification? → handleClarification()
  │         ├─ STEP 4: Copy-Tours Regex → direkt ausführen
  │         └─ STEP 5: GPT Intent-Parsing (gpt-4o-mini)
  │              ├─ action="create_tour/create_driver/create_vehicle"
  │              │    └─ startClarification() → mehrstufiger Dialog
  │              ├─ action="copy_yesterday_tours/create_customer"
  │              │    └─ direkt ausführen
  │              └─ unknown/confidence<0.4 → "Befehl nicht erkannt"
  │
  └─ Twilio XML Response
```

**Warum Admin ZUERST prüfen?**  
Der Admin (Marcus Köhler) ist auch als Fahrer in der DB registriert.
Würde der Driver-Check zuerst laufen, würde sein Dispatch-Befehl wie
`"Marcus fährt heute auf dem HAM CK 900 bei ALS"` als Rollkarten-Antwort
interpretiert werden (die `900` als Rollkarten-Nummer!).

### Telefonnummer-Normalisierung

```
+491732431822  ←  Twilio E.164
01732431822    ←  lokales Format
491732431822   ←  ohne Plus
00491732431822 ←  internationales Format
```

Die Funktion `phoneVariants()` gibt alle 5 Varianten zurück.
DB-Query verwendet `.or(all.map(v => phone.eq.${v}).join(","))`.

### Multi-Turn Clarification Dialog

Datei: `src/lib/whatsapp-clarification.ts`

Persistenz: Tabelle `pending_whatsapp_commands` (expires nach 30 Min)

```
startClarification(parsed, transcript)
  → auto-resolved wenn eindeutig (1 Treffer in DB)
  → fragt nach bei Mehrdeutigkeit (Fuzzy-Suche, max. 3 Optionen)

handleClarification(senderPhone, antwort, pendingCmd)
  → parseOptionChoice() (erkennt "1", "zwei", "3.", Freitext)
  → wenn done: clearPending() + executeResolvedCommand()
```

---

## Datenbank-Tabellen (Supabase)

| Tabelle | Beschreibung |
|---------|-------------|
| `drivers` | Fahrer: name, phone, status, whatsapp_joined_at, rollkarte_whatsapp_enabled |
| `vehicles` | Fahrzeuge: license_plate, type, status |
| `customers` | Kunden: company_name, rollkarte_prefix, rollkarte_accepts_text |
| `tours` | Touren: tour_date, driver_id, vehicle_id, customer_id, rollkarte_status |
| `profiles` | Supabase Auth-User: role (admin/viewer), whatsapp_phone |
| `whatsapp_logs` | Alle WhatsApp-Nachrichten (transcript, parsed_action, success) |
| `pending_whatsapp_commands` | Multi-Turn Dialog State (phone UNIQUE, expires_at) |
| `gutschriften` | Gutschriften-PDFs mit Rechnungsabgleich |
| `repair_invoices` | Reparaturrechnungen |
| `maut_invoices` | Toll Collect Abrechnungen (CSV-Import) |
| `maut_transactions` | Einzelfahrten aus Maut-CSV |
| `fuel_entries` | Kraftstoffeinträge (CSV-Import) |
| `bgl_diesel_prices` | BGL Großverbraucher Dieselpreise (monatlich) |
| `diesel_prices` | Manuelle Dieselpreise |
| `km_records` | Kilometerauswertung |
| `customer_vehicle_aliases` | Kennzeichen-Alias für Kunden |

### Driver.rollkarte_whatsapp_enabled + whatsapp_joined_at

Drei Zustände (sichtbar in der Fahrerliste):
- `enabled=false` → MessageCircle grau, Telefon grau (inaktiv)
- `enabled=true, joined_at=null` → MessageCircle grün, Telefon grau (freigeschaltet, nicht verbunden)
- `enabled=true, joined_at=!null` → MessageCircle grün, Telefon grün (aktiv verbunden ✅)

---

## Cron-Jobs

| Route | Interval | Zweck |
|-------|----------|-------|
| `/api/cron/rollkarte` | Täglich (Morgen) | Rollkarten-Anfragen per WhatsApp senden |
| `/api/cron/diesel-price` | Monatlich | BGL PDF automatisch abrufen |
| `/api/cron/telematics` | Täglich | Telematik-Daten synchronisieren |

---

## Umgebungsvariablen

| Variable | Zweck |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Projekt-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anonymous Key (Frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (Backend/API) |
| `NEXT_PUBLIC_APP_URL` | Basis-URL der App (für Twilio Webhook-Validierung) |
| `TWILIO_ACCOUNT_SID` | Twilio Account |
| `TWILIO_AUTH_TOKEN` | Twilio Auth |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp Nummer (z.B. +14155238886) |
| `OPENAI_API_KEY` | GPT-4o-mini + Whisper |
| `NEXT_PUBLIC_WERKSTATT_URL` | Externe Werkstatt-Portal URL (optional) |

---

## Bekannte Fallstricke

1. **Supabase auf Modulebene** → Build-Fehler `supabaseKey is required` (siehe Regel #2 oben)
2. **force-dynamic vergessen** → Gleicher Fehler, auch mit `makeSupabase()`
3. **Supabase Join-Arrays** → `.vehicle` kann `Vehicle | Vehicle[] | null` sein (Regel #3)
4. **Vercel Build-Cache** → Bei unerklärlichen Build-Fehlern: alten Chunk prüfen ob Änderung wirklich committet wurde
5. **ck-dispo / cargo-dispo Verwirrung** → Aktives Projekt: `cargokoehler-dispo.vercel.app` — Twilio-Webhook zeigt dorthin
6. **Admin = auch Fahrer** → WhatsApp Webhook prüft Admin ZUERST, sonst werden Dispatch-Befehle als Rollkarten-Antworten interpretiert
