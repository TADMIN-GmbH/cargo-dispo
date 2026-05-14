#!/usr/bin/env python3
"""
Batch import Dispolisten PDFs into Supabase.
- Picks latest PDF per date (when duplicates exist)
- Parses customer → vehicle → driver assignments
- Upserts drivers, vehicles, tours into DB
"""

import os
import re
import sys
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path
import pdfplumber

SUPABASE_URL = "https://gbcxekmeeyybxzoynles.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiY3hla21lZXl5Ynh6b3lubGVzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU2NzE0MywiZXhwIjoyMDk0MTQzMTQzfQ.KOWD_zhJBTHRyZHR9UVYdNPYaHmKQR-oI5smrRp83Tg"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

PDF_FOLDERS = [
    "/Users/marcuskoehler/Documents/Dispolisten",
    "/Volumes/Firma/Cargo Köhler GmbH/Kunden/DISPOLISTE/2026-01",
    "/Volumes/Firma/Cargo Köhler GmbH/Kunden/DISPOLISTE/2026-02",
    "/Volumes/Firma/Cargo Köhler GmbH/Kunden/DISPOLISTE/2026-03",
    "/Volumes/Firma/Cargo Köhler GmbH/Kunden/DISPOLISTE/2026-04",
]

# Customer name as it appears in PDF → (customer_id, customer_location_id or None)
CUSTOMER_MAP = {
    "cosi stahllogistik": ("83bf019d-e7a9-40c3-b8eb-e8a746a44ef7", None),
    "speralux": ("02e3aab4-0a48-42d5-8a80-6f15aac70179", None),
    "als arnsberg": ("14fd474a-6df8-4b88-a671-9cc355962ee9", None),
    "ottensmann": ("cef268b1-e6b4-4617-a5c1-1ba460292e12", None),
    "hergarten - klöckner duisburg": ("40ce8588-8859-4a84-8626-272466a098b6", "aeb8f2a0-ddae-4568-aea5-c2f84bc67a70"),
    "hergarten - hoberg und driesch": ("40ce8588-8859-4a84-8626-272466a098b6", "7d1d60e5-abfb-43fa-94d5-e84895e4d8aa"),
    "hergarten - thyssen dortmund": ("40ce8588-8859-4a84-8626-272466a098b6", "f95d2f96-d8ce-4427-a338-81693d9f3f5c"),
    "hergarten - aschenbach & voss": ("40ce8588-8859-4a84-8626-272466a098b6", "39a221c2-d330-4613-95ff-d978a26f0177"),
    "hergarten": ("40ce8588-8859-4a84-8626-272466a098b6", None),
    # EP Eurologistik variants
    "ep eurologistik": ("fde16f8f-74e2-47c2-a01a-e19f4ed3260e", None),
    "ep-eurologistik": ("fde16f8f-74e2-47c2-a01a-e19f4ed3260e", None),
}

# Sections that are NOT customer names (skip vehicles in these)
SKIP_SECTIONS = {
    "springer fahrzeuge", "werkstatt", "nicht im einsatz",
    "bereitschaft", "urlaub", "krank", "taxi", "powered by",
}

def supabase_get(path, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def supabase_post(path, data, upsert_on=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = dict(HEADERS)
    if upsert_on:
        headers["Prefer"] = f"resolution=merge-duplicates,return=representation"
        headers["on_conflict"] = upsert_on
        url += f"?on_conflict={upsert_on}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()[:300]}")
        return None

def collect_pdfs():
    """Collect all PDFs, return dict: date_str → latest pdf path"""
    by_date = {}
    for folder in PDF_FOLDERS:
        p = Path(folder)
        if not p.exists():
            continue
        for pdf in p.glob("*.pdf"):
            m = re.match(r"(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})_Dispoliste\.pdf", pdf.name, re.IGNORECASE)
            if not m:
                continue
            day, month, year, hh, mm = m.groups()
            date_iso = f"{year}-{month}-{day}"
            time_str = f"{hh}:{mm}"
            if date_iso not in by_date or time_str > by_date[date_iso][0]:
                by_date[date_iso] = (time_str, str(pdf))
    return {d: v[1] for d, v in sorted(by_date.items())}

def extract_text(pdf_path):
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    return "\n".join(text_parts)

def parse_dispoliste(text):
    """
    Returns list of dicts: {customer_id, customer_location_id, license_plate, driver_name, driver_phone}
    """
    lines = [l.rstrip() for l in text.split("\n")]

    current_customer_id = None
    current_location_id = None
    in_skip = False

    assignments = []

    # Regex for vehicle line: "• HAM CK 512" or "• HAM CK 511 + HAM CK 118"
    vehicle_re = re.compile(r"^•\s+(HAM CK \d+(?:\s*\+\s*HAM CK \d+)?)(.*)?$")
    # Regex for driver line after vehicle: "First Last Address Phone"
    # Phone typically at end, 10-16 digit, may have spaces/slashes

    i = 0
    pending_vehicle = None  # (license_plate, customer_id, location_id)

    while i < lines:
        line = lines[i]
        line_lower = line.strip().lower()

        # Skip header
        if "cargo köhler" in line_lower or "dispolsite" in line_lower or "dispoliste" in line_lower:
            i += 1
            continue

        # Check if it's a vehicle line
        vm = vehicle_re.match(line.strip())
        if vm:
            plates_raw = vm.group(1)
            rest = vm.group(2).strip() if vm.group(2) else ""

            # Parse license plates (handle "HAM CK 511 + HAM CK 118")
            plates = [p.strip() for p in re.split(r'\s*\+\s*', plates_raw)]

            # rest might have driver name + notes inline (e.g., "Holger Fuchs" or "Motorschaden...")
            # We'll check next line for driver info too

            if in_skip or current_customer_id is None:
                i += 1
                continue

            # Determine driver from rest or next line
            driver_name = None
            driver_phone = None

            # Check if rest has content (inline driver name like "Holger Fuchs" for springer)
            # For regular customer entries, driver info is on next line
            next_i = i + 1
            if next_i < len(lines):
                next_line = lines[next_i].strip()
                # Driver line: starts with name (not bullet, not section header)
                # Has phone number somewhere
                phone_m = re.search(r'((?:0\d[\d\s/\-]{6,15}\d|\+\d[\d\s]{6,15}\d))', next_line)
                if phone_m and not next_line.startswith("•"):
                    # Extract name (everything before address/phone)
                    # Name is typically "Firstname Lastname" at the beginning
                    # Address follows name, then phone
                    # Pattern: Name Address Phone
                    # Let's extract name as first 2 words before a street pattern or phone
                    name_part = next_line[:phone_m.start()].strip()
                    # Remove address (street indicators)
                    street_m = re.search(r'\b(Straße|Str\.|Weg|Ring|Gasse|Allee|Platz|Damm|Chaussee|straße)\b', name_part, re.IGNORECASE)
                    if street_m:
                        name_part = name_part[:street_m.start()].strip()
                        # Remove trailing street number
                        name_part = re.sub(r'\s+\S+$', '', name_part).strip()
                    # Name should be 2-3 words
                    words = name_part.split()
                    if 2 <= len(words) <= 4:
                        driver_name = " ".join(words[:3])  # up to 3 words
                    driver_phone = re.sub(r'[\s\-/]', '', phone_m.group(1))
                    next_i += 1
                elif rest and not rest.startswith("Motor") and not rest.startswith("Fährt") and not rest.startswith("parken"):
                    # Inline name (no phone, like springer vehicles)
                    driver_name = rest.strip()

            for plate in plates:
                assignments.append({
                    "customer_id": current_customer_id,
                    "customer_location_id": current_location_id,
                    "license_plate": plate,
                    "driver_name": driver_name,
                    "driver_phone": driver_phone,
                })

            i = next_i
            continue

        # Check if it's a section header (customer name or skip section)
        stripped = line.strip()
        if stripped and not stripped.startswith("•") and not stripped.startswith("Powered"):
            # Is it a skip section?
            skip_match = any(stripped.lower().startswith(s) for s in SKIP_SECTIONS)
            if skip_match:
                in_skip = True
                current_customer_id = None
                current_location_id = None
                i += 1
                continue

            # Try to match customer
            matched = False
            for key, (cid, lid) in CUSTOMER_MAP.items():
                if stripped.lower() == key or stripped.lower().startswith(key):
                    current_customer_id = cid
                    current_location_id = lid
                    in_skip = False
                    matched = True
                    break

            if not matched and current_customer_id:
                # Could be a driver-only line (e.g., "Krank Kemal Demiri...")
                # or an address continuation — just skip
                pass

        i += 1

    return assignments

def get_or_create_vehicle(license_plate, vehicle_cache):
    if license_plate in vehicle_cache:
        return vehicle_cache[license_plate]
    # Check DB
    data = supabase_get("vehicles", {"select": "id,license_plate", "license_plate": f"eq.{license_plate}"})
    if data:
        vehicle_cache[license_plate] = data[0]["id"]
        return data[0]["id"]
    # Create
    result = supabase_post("vehicles", {"license_plate": license_plate, "type": "LKW", "status": "available"})
    if result:
        vid = result[0]["id"]
        vehicle_cache[license_plate] = vid
        print(f"  Created vehicle: {license_plate} ({vid})")
        return vid
    return None

def get_or_create_driver(driver_name, driver_phone, driver_cache):
    key = driver_name.lower().strip()
    if key in driver_cache:
        return driver_cache[key]
    # Check DB by name
    parts = driver_name.split()
    if len(parts) < 2:
        return None
    first = parts[0]
    last = " ".join(parts[1:])
    data = supabase_get("drivers", {
        "select": "id,first_name,last_name",
        "first_name": f"eq.{first}",
        "last_name": f"eq.{last}",
    })
    if data:
        driver_cache[key] = data[0]["id"]
        # Update phone if we have one
        if driver_phone:
            # PATCH to update phone
            url = f"{SUPABASE_URL}/rest/v1/drivers?id=eq.{data[0]['id']}"
            headers = dict(HEADERS)
            headers["Prefer"] = "return=minimal"
            body = json.dumps({"phone": driver_phone}).encode()
            req = urllib.request.Request(url, data=body, headers=headers, method="PATCH")
            try:
                urllib.request.urlopen(req)
            except Exception:
                pass
        return data[0]["id"]
    # Create
    payload = {"first_name": first, "last_name": last, "status": "available"}
    if driver_phone:
        payload["phone"] = driver_phone
    result = supabase_post("drivers", payload)
    if result:
        did = result[0]["id"]
        driver_cache[key] = did
        print(f"  Created driver: {driver_name} ({did})")
        return did
    return None

def main():
    print("=== Dispolisten Import ===\n")

    pdfs = collect_pdfs()
    print(f"Found {len(pdfs)} unique dates to import\n")

    # Check which dates already have tours to avoid re-importing
    existing_tour_dates = set()
    existing = supabase_get("tours", {"select": "tour_date", "order": "tour_date"})
    for t in (existing or []):
        existing_tour_dates.add(t["tour_date"])

    vehicle_cache = {}
    driver_cache = {}

    imported = 0
    skipped = 0

    for date_iso, pdf_path in pdfs.items():
        if date_iso in existing_tour_dates:
            print(f"[SKIP] {date_iso} — tours already exist")
            skipped += 1
            continue

        print(f"\n[{date_iso}] {Path(pdf_path).name}")

        try:
            text = extract_text(pdf_path)
        except Exception as e:
            print(f"  ERROR reading PDF: {e}")
            continue

        assignments = parse_dispoliste(text)

        if not assignments:
            print(f"  No assignments found")
            continue

        print(f"  Found {len(assignments)} vehicle assignments")

        for a in assignments:
            lp = a["license_plate"]
            vehicle_id = get_or_create_vehicle(lp, vehicle_cache)
            if not vehicle_id:
                print(f"  WARN: Could not get/create vehicle {lp}")
                continue

            driver_id = None
            if a["driver_name"]:
                driver_id = get_or_create_driver(a["driver_name"], a["driver_phone"], driver_cache)

            tour = {
                "tour_date": date_iso,
                "customer_id": a["customer_id"],
                "vehicle_id": vehicle_id,
                "status": "completed",
                "rollkarte_status": "manual",
            }
            if driver_id:
                tour["driver_id"] = driver_id
            if a["customer_location_id"]:
                tour["customer_location_id"] = a["customer_location_id"]

            result = supabase_post("tours", tour)
            if result:
                print(f"  ✓ {lp} → {a['driver_name'] or '(no driver)'}")
            else:
                print(f"  ✗ Failed for {lp}")

        imported += 1
        time.sleep(0.2)  # rate limit

    print(f"\n=== Done: {imported} dates imported, {skipped} skipped ===")

# Fix: lines should be len(lines) not lines
import builtins
_orig_range = builtins.range

def main():
    print("=== Dispolisten Import ===\n")

    pdfs = collect_pdfs()
    print(f"Found {len(pdfs)} unique dates to import\n")

    # Check which dates already have tours to avoid re-importing
    existing_tour_dates = set()
    existing = supabase_get("tours", {"select": "tour_date", "order": "tour_date"})
    for t in (existing or []):
        existing_tour_dates.add(t["tour_date"])

    vehicle_cache = {}
    driver_cache = {}

    imported = 0
    skipped = 0

    for date_iso, pdf_path in pdfs.items():
        if date_iso in existing_tour_dates:
            print(f"[SKIP] {date_iso} — tours already exist")
            skipped += 1
            continue

        print(f"\n[{date_iso}] {Path(pdf_path).name}")

        try:
            text = extract_text(pdf_path)
        except Exception as e:
            print(f"  ERROR reading PDF: {e}")
            continue

        assignments = parse_dispoliste_v2(text)

        if not assignments:
            print(f"  No assignments found")
            continue

        print(f"  Found {len(assignments)} vehicle assignments")

        for a in assignments:
            lp = a["license_plate"]
            vehicle_id = get_or_create_vehicle(lp, vehicle_cache)
            if not vehicle_id:
                print(f"  WARN: Could not get/create vehicle {lp}")
                continue

            driver_id = None
            if a["driver_name"]:
                driver_id = get_or_create_driver(a["driver_name"], a["driver_phone"], driver_cache)

            tour = {
                "tour_date": date_iso,
                "customer_id": a["customer_id"],
                "vehicle_id": vehicle_id,
                "status": "completed",
                "rollkarte_status": "manual",
            }
            if driver_id:
                tour["driver_id"] = driver_id
            if a["customer_location_id"]:
                tour["customer_location_id"] = a["customer_location_id"]

            result = supabase_post("tours", tour)
            if result:
                print(f"  ✓ {lp} → {a['driver_name'] or '(no driver)'}")
            else:
                print(f"  ✗ Failed for {lp}")

        imported += 1
        time.sleep(0.1)

    print(f"\n=== Done: {imported} dates imported, {skipped} skipped ===")


def parse_dispoliste_v2(text):
    """Clean rewrite of parser."""
    lines = text.split("\n")

    current_customer_id = None
    current_location_id = None
    in_active_section = False

    assignments = []

    vehicle_re = re.compile(r"^•\s+((?:HAM CK \d+)(?:\s*\+\s*HAM CK \d+)*)(.*)?$")
    phone_re = re.compile(r'((?:0|\+)[\d\s/\-]{8,18}\d)')

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1

        if not line:
            continue

        lower = line.lower()

        # Skip header lines
        if any(x in lower for x in ["cargo köhler", "dispolsite", "dispoliste stand", "powered by tcpdf"]):
            continue

        # Vehicle line
        vm = vehicle_re.match(line)
        if vm:
            if not in_active_section or current_customer_id is None:
                continue

            plates_raw = vm.group(1)
            inline = vm.group(2).strip() if vm.group(2) else ""

            plates = [p.strip() for p in re.split(r'\s*\+\s*', plates_raw)]

            driver_name = None
            driver_phone = None

            # Check next line for driver info
            if i < len(lines):
                next_line = lines[i].strip()
                pm = phone_re.search(next_line)
                if pm and not next_line.startswith("•"):
                    raw_phone = pm.group(1)
                    driver_phone = re.sub(r'[\s\-/]', '', raw_phone)

                    name_part = next_line[:pm.start()].strip()
                    # Extract name from "Firstname [Middle] Lastname StreetName HouseNo, ZIP City"
                    # Strategy: split into words, take words that look like name parts
                    # A word is a street component if it (case-insensitively) contains a street suffix
                    # or is a German address preposition
                    STREET_SUFFIXES = ('straße','strasse','str.','str','weg','ring','gasse','allee',
                                       'platz','damm','chaussee','ufer','pfad','wall','graben')
                    ADDR_PREPOSITIONS = {'im','am','an','auf','zum','zur','in','vor','bei','unter','ob'}
                    # Also cut at comma or first standalone number
                    if "," in name_part:
                        name_part = name_part[:name_part.index(",")].strip()
                    hn = re.search(r'\s+\d', name_part)
                    if hn:
                        name_part = name_part[:hn.start()].strip()
                    # Now remove trailing words that are street components
                    words = name_part.split()
                    name_words = []
                    for idx, w in enumerate(words):
                        wl = w.lower().rstrip('.')
                        is_street = (any(wl.endswith(s) for s in STREET_SUFFIXES) or
                                     wl in ADDR_PREPOSITIONS)
                        # Look ahead 1-2 words: if next word(s) are street → stop now
                        next_is_street = False
                        for lookahead in range(1, 3):
                            if idx + lookahead < len(words):
                                nwl = words[idx + lookahead].lower().rstrip('.')
                                if (any(nwl.endswith(s) for s in STREET_SUFFIXES) or
                                        nwl in ADDR_PREPOSITIONS):
                                    next_is_street = True
                                    break
                        if is_street or (next_is_street and len(name_words) >= 2):
                            break  # stop; everything after is address
                        name_words.append(w)
                    # Valid name: 2-4 words, each word must start with a letter
                    name_ok = (2 <= len(name_words) <= 4 and
                               all(re.match(r'^[A-Za-zÄÖÜäöüß]', w) for w in name_words))
                    if name_ok:
                        driver_name = " ".join(name_words)

                    i += 1  # consume driver line
                elif inline and len(inline.split()) <= 4:
                    # Inline name (e.g. springer section) — validate it looks like a real name
                    iw = inline.split()
                    if (2 <= len(iw) <= 4 and
                            all(re.match(r'^[A-Za-zÄÖÜäöüß]', w) for w in iw)):
                        driver_name = inline

            for plate in plates:
                assignments.append({
                    "customer_id": current_customer_id,
                    "customer_location_id": current_location_id,
                    "license_plate": plate,
                    "driver_name": driver_name,
                    "driver_phone": driver_phone,
                })
            continue

        # Section header detection
        # Stop sections
        stop_sections = ["springer fahrzeuge", "werkstatt", "nicht im einsatz",
                        "bereitschaft", "krank", "urlaub", "taxi", "mitgeteilt"]
        if any(lower.startswith(s) for s in stop_sections):
            in_active_section = False
            current_customer_id = None
            current_location_id = None
            continue

        # Customer matching (only if line doesn't start with bullet)
        if not line.startswith("•"):
            matched = False
            # Sort by key length descending to match more specific keys first
            for key in sorted(CUSTOMER_MAP.keys(), key=len, reverse=True):
                if lower == key or lower.startswith(key):
                    current_customer_id, current_location_id = CUSTOMER_MAP[key]
                    in_active_section = True
                    matched = True
                    break
            # If no match and we're in active section, treat as continuation/noise — ignore

    return assignments


if __name__ == "__main__":
    main()
