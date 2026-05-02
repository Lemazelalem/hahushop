// app/api/admin/customer-stats/route.ts
// Returns user counts by role and daily new-user growth for the admin customer data page.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthenticatedAdmin(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* read-only context */ }
        },
      },
    }
  );
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return session.user.id;
}

export async function GET() {
  try {
    const adminId = await getAuthenticatedAdmin();
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getSupabaseAdmin();

    const { data: profiles, error } = await db
      .from("profiles")
      .select("id, role, created_at");

    if (error) {
      console.error("[customer-stats] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = profiles ?? [];

    // Role counts
    const roleCounts: Record<string, number> = {
      customer: 0,
      public_employee: 0,
      seller: 0,
      admin: 0,
      business: 0,
      other: 0,
    };
    for (const p of rows) {
      const r = (p.role ?? "customer").toLowerCase();
      if (r in roleCounts) roleCounts[r]++;
      else roleCounts.other++;
    }

    // Daily new users — last 30 days
    const now = new Date();
    const daily: { date: string; label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-CA"); // YYYY-MM-DD
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      daily.push({ date: key, label, count: 0 });
    }
    const dailyMap: Record<string, number> = {};
    for (const entry of daily) dailyMap[entry.date] = 0;

    for (const p of rows) {
      if (!p.created_at) continue;
      const key = new Date(p.created_at).toLocaleDateString("en-CA");
      if (key in dailyMap) dailyMap[key]++;
    }
    for (const entry of daily) entry.count = dailyMap[entry.date];

    // Monthly new users — last 12 months
    const monthly: { month: string; label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      monthly.push({ month: key, label, count: 0 });
    }
    const monthlyMap: Record<string, number> = {};
    for (const entry of monthly) monthlyMap[entry.month] = 0;

    for (const p of rows) {
      if (!p.created_at) continue;
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthlyMap) monthlyMap[key]++;
    }
    for (const entry of monthly) entry.count = monthlyMap[entry.month];

    return NextResponse.json({
      total: rows.length,
      roleCounts,
      daily,
      monthly,
    });
  } catch (err: unknown) {
    console.error("[customer-stats] error:", err);
    const msg = err instanceof Error ? err.message : "Failed to load customer stats";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
