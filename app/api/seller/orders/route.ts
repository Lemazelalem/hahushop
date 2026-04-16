// app/api/seller/orders/route.ts
// Returns orders that contain items belonging to the authenticated seller.
// Reads from orders.cart_snapshot (same as admin) — never touches order_items,
// so it works regardless of order_items RLS or insert failures.
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
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

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

    // Fetch recent orders with cart_snapshot — same as admin approach.
    // Service role bypasses orders RLS (which only allows the buyer to read their own orders).
    step = "orders-query";
    const { data: orders, error: ordersErr } = await db
      .from("orders")
      .select(
        "id, created_at, status, payment_status, shipping_full_name, shipping_phone, shipping_city, shipping_region, cart_snapshot"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (ordersErr) {
      console.error("[seller/orders] orders query error:", ordersErr);
      return NextResponse.json({ error: ordersErr.message }, { status: 500 });
    }

    // Walk each order's cart_snapshot.items, keep only items belonging to this seller.
    step = "filter";
    const items: unknown[] = [];

    for (const order of orders ?? []) {
      const snapshotItems: any[] = Array.isArray(order.cart_snapshot?.items)
        ? order.cart_snapshot.items
        : [];

      const sellerItems = snapshotItems.filter(
        (i: any) => i.seller_id === sellerId
      );

      if (sellerItems.length === 0) continue;

      const orderInfo = {
        id: order.id,
        created_at: order.created_at,
        status: order.status,
        payment_status: order.payment_status,
        shipping_full_name: order.shipping_full_name,
        shipping_phone: order.shipping_phone,
        shipping_city: order.shipping_city,
        shipping_region: order.shipping_region,
      };

      sellerItems.forEach((si: any, idx: number) => {
        items.push({
          id: `${order.id}-${idx}`,
          product_id: si.product_id ?? null,
          name_snapshot: si.name_snapshot ?? "",
          emoji_snapshot: si.emoji_snapshot ?? null,
          image_url_snapshot: si.image_url_snapshot ?? null,
          quantity: si.qty ?? 0,
          line_total_cents: si.line_total_cents ?? 0,
          color_name: si.color_name ?? null,
          size_label: si.size_label ?? null,
          order_id: order.id,
          orders: orderInfo,
        });
      });
    }

    // Enrich items with seller_price_cents from products table.
    // This is the seller's take (not the customer-facing final_price_cents).
    step = "seller-prices";
    const productIds = [...new Set(
      (items as any[]).map((i) => i.product_id).filter(Boolean)
    )];

    const sellerPriceMap: Record<string, number> = {};
    if (productIds.length > 0) {
      const { data: prods } = await db
        .from("products")
        .select("id, seller_price_cents")
        .in("id", productIds);
      for (const p of prods ?? []) {
        sellerPriceMap[p.id] = p.seller_price_cents ?? 0;
      }
    }

    const enrichedItems = (items as any[]).map((item) => ({
      ...item,
      seller_price_cents: item.product_id ? (sellerPriceMap[item.product_id] ?? 0) : 0,
    }));

    console.log("[seller/orders] sellerId:", sellerId, "matching items:", enrichedItems.length);

    return NextResponse.json({ items: enrichedItems });
  } catch (err: unknown) {
    console.error(`[seller/orders] error at step '${step}':`, err);
    const msg = err instanceof Error ? err.message : "Failed to load orders";
    return NextResponse.json({ error: `[${step}] ${msg}` }, { status: 500 });
  }
}
