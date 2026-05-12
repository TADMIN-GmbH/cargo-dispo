export type UserRole = "admin" | "employee";

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
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
  length_m?: number;
  width_m?: number;
  height_m?: number;
  payload_kg?: number;
  notes?: string;
  created_at: string;
}

export interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  phone?: string;
  license_class?: string;
  status: "available" | "on_tour" | "off" | "sick";
  current_vehicle_id?: string;
  current_vehicle?: Vehicle;
  notes?: string;
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
