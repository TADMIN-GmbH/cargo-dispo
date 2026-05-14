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
