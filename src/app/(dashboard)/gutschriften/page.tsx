import { createClient } from "@/lib/supabase/server";
import { GutschriftenView } from "@/components/gutschriften/gutschriften-view";

export default async function GutschriftenPage() {
  const supabase = await createClient();

  const { data: positionen } = await supabase
    .from("gutschrift_positionen")
    .select("*, gutschrift:gutschriften(id, gutschrift_nr, document_date, absender, file_name)")
    .order("bel_datum", { ascending: false });

  const { data: gutschriften } = await supabase
    .from("gutschriften")
    .select("*")
    .order("document_date", { ascending: false });

  return (
    <GutschriftenView
      positionen={positionen ?? []}
      gutschriften={gutschriften ?? []}
    />
  );
}
