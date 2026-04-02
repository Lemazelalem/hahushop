// API route for admin to read profiles (bypasses RLS)
// The profiles table has RLS that only allows auth.uid() = id reads,
// so admin pages must use this server-side route to read other users' profiles.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthenticatedAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can throw in read-only contexts
          }
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

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

export async function GET(req: Request) {
  try {
    const adminId = await getAuthenticatedAdmin();
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role"); // e.g. "seller"
    const ids = searchParams.get("ids"); // comma-separated IDs

    const db = getSupabaseAdmin();
    const fields = "id, display_name, full_name, phone, business_name, role, seller_status, is_verified_seller";

    let query = db.from("profiles").select(fields);

    if (role) {
      query = query.eq("role", role);
    }

    if (ids) {
      const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        query = query.in("id", idList);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("[admin/profiles GET] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profiles: data ?? [] });
  } catch (error: unknown) {
    console.error("[admin/profiles GET] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to load profiles";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
