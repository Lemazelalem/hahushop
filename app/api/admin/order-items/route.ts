// app/api/admin/order-items/route.ts
// Returns order_items for a given order, enriched with seller profile + email
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
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
            // read-only context
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

export async function GET(req: NextRequest) {
  try {
    const adminId = await getAuthenticatedAdmin();
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Fetch order items
    const { data: items, error: itemsErr } = await db
      .from("order_items")
      .select(
        "id, product_id, seller_id, name_snapshot, emoji_snapshot, image_url_snapshot, quantity, price_snapshot_cents, line_total_cents, color_name, size_label"
      )
      .eq("order_id", orderId)
      .order("id");

    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ items: [], sellers: {} });
    }

    // Collect unique seller IDs
    const sellerIds = [...new Set(items.map((i) => i.seller_id).filter(Boolean))] as string[];

    if (sellerIds.length === 0) {
      return NextResponse.json({ items, sellers: {} });
    }

    // Fetch profiles for all sellers in parallel with auth emails
    const [profilesRes, ...authResults] = await Promise.all([
      db
        .from("profiles")
        .select("id, display_name, full_name, business_name, phone")
        .in("id", sellerIds),
      ...sellerIds.map((id) => db.auth.admin.getUserById(id)),
    ]);

    const profiles = profilesRes.data ?? [];

    // Build seller map: id -> { display_name, email, phone, business_name }
    const sellers: Record<
      string,
      { display_name: string | null; email: string | null; phone: string | null; business_name: string | null }
    > = {};

    sellerIds.forEach((id, idx) => {
      const profile = profiles.find((p) => p.id === id);
      const authUser = authResults[idx]?.data?.user;
      sellers[id] = {
        display_name: profile?.display_name ?? profile?.full_name ?? null,
        email: authUser?.email ?? null,
        phone: profile?.phone ?? null,
        business_name: profile?.business_name ?? null,
      };
    });

    return NextResponse.json({ items, sellers });
  } catch (error: unknown) {
    console.error("[admin/order-items GET] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to load order items";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
