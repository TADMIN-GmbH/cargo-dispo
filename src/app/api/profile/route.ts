export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const { full_name } = await request.json();
  if (!full_name?.trim()) {
    return NextResponse.json({ error: "Name darf nicht leer sein." }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: full_name.trim() })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Also update auth metadata
  await supabase.auth.updateUser({ data: { full_name: full_name.trim() } });

  return NextResponse.json({ success: true });
}
