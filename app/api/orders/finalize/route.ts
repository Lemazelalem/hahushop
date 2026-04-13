// app/api/orders/finalize/route.ts
// Server-side order finalization: inserts order_items and decrements stock.
// Uses service role to bypass any RLS policies on order_items and products.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type SnapshotItem = {
  kind: string;
  product_id: string;
  seller_id: string | null;
  name_snapshot: string;
  emoji_snapshot: string;
  image_url_snapshot: string | null;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
  price_tier: string;
  color_name: string | null;
  size_label: string | null;
  color_variant_id: string | null;
  size_variant_id: string | null;
};

async function getSessionUserId(): Promise<string | null> {
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
  return session?.user?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { orderId, items } = body as { orderId?: string; items?: SnapshotItem[] };

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Missing items" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Verify order belongs to this user (prevent spoofing)
    const { data: order, error: orderErr } = await db
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Insert order_items using service role (bypasses RLS)
    const payload = items.map((s) => ({
      order_id: orderId,
      product_id: s.product_id,
      seller_id: s.seller_id ?? null,
      name_snapshot: s.name_snapshot,
      emoji_snapshot: s.emoji_snapshot,
      image_url_snapshot: s.image_url_snapshot ?? null,
      quantity: s.qty,
      price_snapshot_cents: s.unit_price_cents,
      line_total_cents: s.line_total_cents,
      price_tier: s.price_tier,
      color_name: s.color_name,
      size_label: s.size_label,
      color_variant_id: s.color_variant_id,
      size_variant_id: s.size_variant_id,
    }));

    const { error: insertErr } = await db.from("order_items").insert(payload);
    if (insertErr) {
      console.error("[finalize] order_items insert error:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    console.log("[finalize] order_items inserted:", { orderId, count: payload.length });

    // Decrement stock (non-critical — log errors but don't fail the response)
    try {
      // Group items by product_id
      const byProduct = new Map<string, SnapshotItem[]>();
      for (const item of items) {
        const list = byProduct.get(item.product_id) ?? [];
        list.push(item);
        byProduct.set(item.product_id, list);
      }

      for (const [productId, productItems] of byProduct) {
        const { data: product, error: prodErr } = await db
          .from("products")
          .select("id, stock_quantity, size_variants")
          .eq("id", productId)
          .maybeSingle();

        if (prodErr || !product) {
          console.warn("[finalize] could not fetch product for stock decrement:", productId);
          continue;
        }

        // Separate variant vs non-variant items for this product
        const variantItems = productItems.filter((i) => i.size_variant_id);
        const simpleItems = productItems.filter((i) => !i.size_variant_id);

        // Decrement size_variants stock
        if (variantItems.length > 0 && Array.isArray(product.size_variants)) {
          const variants: Array<{ id: string; stock: number; [key: string]: unknown }> =
            JSON.parse(JSON.stringify(product.size_variants));
          for (const item of variantItems) {
            const v = variants.find((sv) => sv.id === item.size_variant_id);
            if (v) {
              v.stock = Math.max(0, (Number(v.stock) || 0) - item.qty);
            }
          }
          const { error: varErr } = await db
            .from("products")
            .update({ size_variants: variants })
            .eq("id", productId);
          if (varErr) console.warn("[finalize] size_variants decrement error:", varErr, productId);
        }

        // Decrement stock_quantity for simple (non-variant) items
        if (simpleItems.length > 0) {
          const totalQty = simpleItems.reduce((s, i) => s + i.qty, 0);
          const currentStock = typeof product.stock_quantity === "number" ? product.stock_quantity : 0;
          const newStock = Math.max(0, currentStock - totalQty);
          const { error: stockErr } = await db
            .from("products")
            .update({ stock_quantity: newStock })
            .eq("id", productId);
          if (stockErr) console.warn("[finalize] stock_quantity decrement error:", stockErr, productId);
        }
      }

      console.log("[finalize] stock decremented for", byProduct.size, "product(s)");
    } catch (stockEx) {
      console.warn("[finalize] stock decrement exception:", stockEx);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[finalize] unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Failed to finalize order";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
