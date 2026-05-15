create table if not exists maut_invoices (
  id uuid primary key default gen_random_uuid(),
  internal_id text unique not null,
  account_number text,
  period_from date not null,
  period_to date not null,
  total_km numeric(10,1),
  total_eur numeric(10,2),
  transaction_count int,
  created_at timestamptz default now()
);

create table if not exists maut_transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references maut_invoices(id) on delete cascade,
  vehicle_id uuid references vehicles(id) on delete set null,
  license_plate_raw text,
  license_plate_normalized text,
  booked_at timestamptz,
  entry_point text,
  via text,
  exit_point text,
  km numeric(8,1),
  toll_eur numeric(8,2),
  cancellation_fee_eur numeric(8,2) default 0,
  booking_number text,
  created_at timestamptz default now()
);

alter table maut_invoices enable row level security;
alter table maut_transactions enable row level security;

create policy "authenticated read maut_invoices" on maut_invoices for select to authenticated using (true);
create policy "authenticated insert maut_invoices" on maut_invoices for insert to authenticated with check (true);
create policy "authenticated read maut_transactions" on maut_transactions for select to authenticated using (true);
create policy "authenticated insert maut_transactions" on maut_transactions for insert to authenticated with check (true);
