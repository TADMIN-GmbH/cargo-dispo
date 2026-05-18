export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  try {
    const { email, role } = await request.json();

    if (!email || !role) {
      return NextResponse.json({ error: "E-Mail und Rolle sind erforderlich." }, { status: 400 });
    }

    const supabase = makeAdminSupabase();

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role },
    });

    if (error) {
      console.error("[team/invite] Supabase invite error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId: data.user?.id });
  } catch (err: any) {
    console.error("[team/invite] Unexpected error:", err);
    return NextResponse.json({ error: "Interner Fehler beim Einladen." }, { status: 500 });
  }
}
