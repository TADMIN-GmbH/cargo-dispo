import { createServerClient } from "@supabase/ssr";

// Service-role client — bypasses RLS. Only use server-side (webhooks, cron jobs).
// Uses @supabase/ssr (same package as the rest of the app) to avoid localStorage issues.
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    }
  );
}
