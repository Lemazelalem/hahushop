// app/api/orders/notify-seller/route.ts
// Sends new order notification email to each seller who has items in the order
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getMailer, SENDER_ADDRESS } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Fetch order basics
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        `id, created_at, total_cents, payment_method,
         shipping_full_name, shipping_phone, shipping_city, shipping_region`
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Fetch order items with seller_id
    const { data: items } = await supabase
      .from("order_items")
      .select(
        "id, seller_id, name_snapshot, emoji_snapshot, quantity, line_total_cents, color_name, size_label"
      )
      .eq("order_id", orderId);

    if (!items || items.length === 0) {
      console.log("[notify-seller] no order_items found for order", orderId);
      return NextResponse.json({ sent: 0 });
    }

    console.log("[notify-seller] order_items found:", items.length, "seller_ids:", items.map((i) => i.seller_id));

    // Group items by seller
    const bySeller = new Map<string, typeof items>();
    for (const item of items) {
      if (!item.seller_id) continue;
      const list = bySeller.get(item.seller_id) ?? [];
      list.push(item);
      bySeller.set(item.seller_id, list);
    }

    if (bySeller.size === 0) {
      console.log("[notify-seller] all items have null seller_id — no sellers to notify for order", orderId);
      return NextResponse.json({ sent: 0 });
    }

    const money = (cents: number) => `ETB ${(cents / 100).toFixed(2)}`;
    const shortId = order.id.slice(0, 8).toUpperCase();
    const createdAt = new Date(order.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hahushop.com";
    const mailer = getMailer();

    let sent = 0;

    for (const [sellerId, sellerItems] of bySeller) {
      // Get seller email
      const { data: authUser } = await supabase.auth.admin.getUserById(sellerId);
      const sellerEmail = authUser?.user?.email;
      if (!sellerEmail) continue;

      const sellerTotal = sellerItems.reduce(
        (s, i) => s + (i.line_total_cents ?? 0),
        0
      );

      const itemRows = sellerItems
        .map(
          (item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;">
            ${item.emoji_snapshot || "📦"} ${item.name_snapshot}
            ${item.color_name ? `<br><span style="font-size:12px;color:#94a3b8;">Color: ${item.color_name}</span>` : ""}
            ${item.size_label ? `<br><span style="font-size:12px;color:#94a3b8;">Size: ${item.size_label}</span>` : ""}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#334155;">
            ${item.quantity}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">
            ${money(item.line_total_cents ?? 0)}
          </td>
        </tr>`
        )
        .join("");

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#14532d,#166534);border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:24px;">
      <div style="font-size:32px;margin-bottom:8px;">🛍️</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;">New Order Received!</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:14px;">
        Someone just purchased your product(s) on HahuShop
      </p>
    </div>

    <!-- Order Info -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <table width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="font-size:13px;color:#64748b;">Order ID</td>
          <td style="text-align:right;font-size:14px;font-weight:700;color:#0f172a;font-family:monospace;">#${shortId}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748b;padding-top:8px;">Date</td>
          <td style="text-align:right;font-size:13px;color:#334155;padding-top:8px;">${createdAt}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748b;padding-top:8px;">Your Earnings</td>
          <td style="text-align:right;font-size:15px;font-weight:800;color:#16a34a;padding-top:8px;">${money(sellerTotal)}</td>
        </tr>
      </table>
    </div>

    <!-- Items -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
      <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f0fdf4;">
        <strong style="font-size:14px;color:#0f172a;">Your Items in This Order</strong>
      </div>
      <table width="100%" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Item</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748b;font-weight:600;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#64748b;font-weight:600;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>

    <!-- Delivery Info -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;">📍 Delivery Address</div>
      <div style="font-size:13px;color:#334155;line-height:1.6;">
        ${order.shipping_full_name}<br>
        ${order.shipping_city}, ${order.shipping_region}<br>
        📞 ${order.shipping_phone}
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${siteUrl}/seller" style="display:inline-block;background:#16a34a;color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">
        View in Seller Dashboard
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">HahuShop · Ethiopia's Smart Marketplace</p>
      <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">
        This notification was sent to ${sellerEmail} because you have products on HahuShop.
      </p>
    </div>

  </div>
</body>
</html>`;

      const text = `New Order #${shortId} — HahuShop

Someone purchased your product(s)!

Date: ${createdAt}
Your Earnings: ${money(sellerTotal)}

Items:
${sellerItems.map((i) => `- ${i.emoji_snapshot || ""} ${i.name_snapshot} x${i.quantity} — ${money(i.line_total_cents ?? 0)}`).join("\n")}

Delivery: ${order.shipping_full_name}, ${order.shipping_city}, ${order.shipping_region}
Phone: ${order.shipping_phone}

View orders: ${siteUrl}/seller

— HahuShop`;

      await mailer.sendMail({
        from: SENDER_ADDRESS,
        to: sellerEmail,
        subject: `🛍️ New Order #${shortId} — You made a sale!`,
        html,
        text,
      });

      sent++;
    }

    console.log("[notify-seller] emails sent", { orderId, sent });
    return NextResponse.json({ sent });
  } catch (err: any) {
    console.error("[notify-seller]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to notify sellers" },
      { status: 500 }
    );
  }
}
