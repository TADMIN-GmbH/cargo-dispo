import { createClient } from "@/lib/supabase/server";
import { GutschriftenView } from "@/components/gutschriften/gutschriften-view";

export default async function GutschriftenPage() {
  const supabase = await createClient();

  const [{ data: positionen }, { data: gutschriften }, { data: aliases }] = await Promise.all([
    supabase
      .from("gutschrift_positionen")
      .select("*, gutschrift:gutschriften(id, gutschrift_nr, document_date, absender, file_name)")
      .order("bel_datum", { ascending: false }),
    supabase
      .from("gutschriften")
      .select("*")
      .order("document_date", { ascending: false }),
    supabase
      .from("customer_vehicle_aliases")
      .select("alias, vehicle:vehicles(license_plate), customer:customers(absender:company_name)"),
  ]);

  // Build lookup: absender → { alias → license_plate }
  const aliasMap: Record<string, Record<string, string>> = {};
  for (const a of aliases ?? []) {
    const absender = (a.customer as any)?.absender;
    const plate = (a.vehicle as any)?.license_plate;
    if (absender && a.alias && plate) {
      if (!aliasMap[absender]) aliasMap[absender] = {};
      aliasMap[absender][a.alias] = plate;
    }
  }

  return (
    <GutschriftenView
      positionen={positionen ?? []}
      gutschriften={gutschriften ?? []}
      aliasMap={aliasMap}
    />
  );
}
