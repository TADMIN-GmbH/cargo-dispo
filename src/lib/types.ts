export type UserRole = "admin" | "employee";

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  whatsapp_phone?: string;
  created_at: string;
}

export interface Vehicle {
  id: string;
  license_plate: string;
  type: string;
  brand?: string;
  model?: string;
  year?: number;
  status: "available" | "on_tour" | "maintenance" | "inactive";
  current_driver_id?: string;
  current_driver?: Driver;
  registration_date?: string;
  vin?: string;
  tire_size?: string;
  towing_vehicle_id?: string;
  km_class?: string;      // null | "300km" | "450km" — only relevant for SZM
  length_m?: number;
  width_m?: number;
  height_m?: number;
  payload_kg?: number;
  notes?: string;
  created_at: string;
}

export interface PhoneHistoryEntry {
  phone: string;
  changed_at: string;
  changed_by?: string;
}

export interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  phone?: string;
  phone_history?: PhoneHistoryEntry[];
  license_class?: string;
  status: "available" | "on_tour" | "off" | "sick";
  current_vehicle_id?: string;
  current_vehicle?: Vehicle;
  rollkarte_whatsapp_enabled?: boolean;
  whatsapp_joined_at?: string | null;
  notes?: string;
  created_at: string;
}

export interface CustomerLocation {
  id: string;
  customer_id: string;
  name: string;
  street?: string;
  zip?: string;
  city?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at: string;
}

export interface CustomerVehicleAlias {
  id: string;
  customer_id: string;
  alias: string;
  vehicle_id?: string;
  vehicle?: Pick<Vehicle, "id" | "license_plate" | "type">;
  created_at: string;
}

export interface Customer {
  id: string;
  company_name: string;
  contact_person?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  notes?: string;
  rollkarte_prefix?: string;
  rollkarte_accepts_text?: boolean;
  vehicle_ref_label?: string;
  vehicle_aliases?: CustomerVehicleAlias[];
  locations?: CustomerLocation[];
  price_daily_rate?: number;
  price_diesel_pct?: number;
  price_toll_flat?: number;
  invert_gutschrift_sign?: boolean;
  km_billing_type?: "per_vehicle" | "fleet";
  created_at: string;
}

export interface Tour {
  id: string;
  tour_date: string;
  driver_id?: string;
  driver?: Driver;
  vehicle_id?: string;
  vehicle?: Vehicle;
  customer_id?: string;
  customer?: Customer;
  status: "planned" | "active" | "completed" | "cancelled";
  pickup_address?: string;
  delivery_address?: string;
  notes?: string;
  rollkarte_number?: string;
  rollkarte_status: "pending" | "requested" | "confirming" | "received" | "manual";
  rollkarte_requested_at?: string;
  rollkarte_answered_at?: string;
  rollkarte_source?: "whatsapp" | "manual";
  rollkarte_updated_by?: string;
  billing_ref?: string;
  soll_netto?: number;
  actual_km?: number | null;
  customer_location_id?: string;
  customer_location?: CustomerLocation;
  created_by?: string;
  created_at: string;
}

export interface WhatsAppLog {
  id: string;
  sender_number: string;
  transcript: string;
  parsed_action?: Record<string, unknown>;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export interface Gutschrift {
  id: string;
  gutschrift_nr?: string;
  document_date?: string;
  absender?: string;
  file_path?: string;
  file_name?: string;
  netto_gesamt?: number;
  mwst?: number;
  brutto_gesamt?: number;
  extracted_by_ai?: boolean;
  billing_type?: 'per_tour' | 'per_period';
  period_from?: string;
  period_to?: string;
  reconciliation_status?: 'none' | 'pending' | 'ok' | 'conflict';
  created_at: string;
  positionen?: GutschriftPosition[];
}

export interface GutschriftPosition {
  id: string;
  gutschrift_id: string;
  bel_datum?: string;
  kennzeichen?: string;
  tour_nr?: string;
  auftrag_nr?: string;
  kg?: number;
  netto_betrag?: number;
  tour_id?: string;
  vehicle_entry_id?: string;
  daily_rate?: number;
  diesel_amount?: number;
  match_status?: string;
  created_at: string;
}

export interface DieselPrice {
  id: string;
  month: string;          // "2026-02-01"
  price_brutto: number;
  price_netto: number;
  fetched_at: string;
  source_url?: string;
  created_at: string;
}

export interface CustomerPricingModel {
  id: string;
  customer_id: string;
  vehicle_type: string;     // "MW 12t" | "MW 15t" | "MW 18t" | "MW 26t" | "SZM"
  km_class?: string;        // null | "300km" | "450km"
  daily_rate_netto: number;
  maut_flat: number;
  accessory_flat: number;   // flat add-on per day, NOT subject to diesel surcharge (e.g. trailer)
  diesel_base_price: number;
  diesel_factor: number;    // e.g. 20 (= 20%)
  diesel_source: string;    // "en2x" | "bgl"
  diesel_lag_months: number; // 1 or 2
  floater_type: string;     // "formula" | "table"
  free_km: number;          // km included per day before extra charge kicks in
  extra_km_rate: number;    // €/km for km beyond free_km
  valid_from: string;
  notes?: string;
  created_at: string;
}

export interface GutschriftVehicleEntry {
  id: string;
  gutschrift_id: string;
  license_plate: string;
  period_from?: string;
  period_to?: string;
  days_claimed?: number;
  daily_rate?: number;
  netto_subtotal?: number;
  diesel_pct?: number;
  diesel_amount?: number;
  days_found?: number;
  match_status: 'pending' | 'matched' | 'conflict' | 'accepted';
  created_at: string;
}

export interface Invite {
  id: string;
  email: string;
  invited_by: string;
  role: UserRole;
  token: string;
  accepted: boolean;
  expires_at: string;
  created_at: string;
}
