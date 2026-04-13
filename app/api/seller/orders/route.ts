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
  let step = "init";
  try {
    step = "auth";
    const sellerId = await getAuthenticatedSellerId();
    if (!sellerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    step = "db-init";
    const db = getSupabaseAdmin();

    // Step 1: Fetch order_items for this seller
    step = "order_items-query";
    const { data: rawItems, error: itemsErr } = await db
      .from("order_items")
      .select("id, product_id, name_snapshot, emoji_snapshot, image_url_snapshot, quantity, line_total_cents, color_name, size_label, order_id")
      .eq("seller_id", sellerId)
      .order("order_id", { ascending: false })
      .limit(100);

    if (itemsErr) {
      console.error("[seller/orders] items query error:", itemsErr);
      return NextResponse.json({ error: `order_items: ${itemsErr.message}` }, { status: 500 });
    }

    if (!rawItems || rawItems.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // Step 2: Fetch parent orders separately
    step = "orders-query";
    const orderIds = [...new Set(rawItems.map((i) => i.order_id))];
    const { data: orders, error: ordersErr } = await db
      .from("orders")
      .select("id, created_at, status, payment_status, shipping_full_name, shipping_phone, shipping_city, shipping_region")
      .in("id", orderIds);

    if (ordersErr) {
      console.error("[seller/orders] orders query error:", ordersErr);
      return NextResponse.json({ error: `orders: ${ordersErr.message}` }, { status: 500 });
    }

    // Step 3: Merge
    step = "merge";
    const orderMap = new Map((orders ?? []).map((o) => [o.id, o]));
    const items = rawItems.map((item) => ({
      ...item,
      orders: orderMap.get(item.order_id) ?? null,
    }));

    return NextResponse.json({ items });
  } catch (err: unknown) {
    console.error(`[seller/orders] error at step '${step}':`, err);
    const msg = err instanceof Error ? err.message : "Failed to load orders";
    return NextResponse.json({ error: `[${step}] ${msg}` }, { status: 500 });
  }
}
