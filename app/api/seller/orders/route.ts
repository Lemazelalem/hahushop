// app/api/seller/orders/route.ts
// Returns order_items (and parent order details) for the authenticated seller.
// Uses service role to bypass orders RLS (which only allows the buyer to read).
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthenticatedSellerId(): Promise<string | null> {
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
    .select("role, seller_status")
    .eq("id", session.user.id)
    .maybeSingle();

  // Allow sellers and admins
  if (!profile || (profile.role !== "seller" && profile.role !== "admin")) {
    return null;
  }

  return session.user.id;
}

export async function GET() {
  try {
    const sellerId = await getAuthenticatedSellerId();
    if (!sellerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getSupabaseAdmin();

    // Fetch order_items for this seller (service role — bypasses RLS on orders)
    const { data: items, error } = await db
      .from("order_items")
      .select(
        `id, name_snapshot, emoji_snapshot, image_url_snapshot,
         quantity, line_total_cents, color_name, size_label, order_id,
         orders(id, created_at, status, payment_status,
                shipping_full_name, shipping_phone, shipping_city, shipping_region)`
      )
      .eq("seller_id", sellerId)
      .order("order_id", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[seller/orders] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: items ?? [] });
  } catch (err: unknown) {
    console.error("[seller/orders] error:", err);
    const msg = err instanceof Error ? err.message : "Failed to load orders";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
