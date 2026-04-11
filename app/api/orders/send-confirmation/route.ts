// app/api/orders/send-confirmation/route.ts
// Sends order confirmation email to the customer after checkout
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getMailer, SENDER_ADDRESS } from "@/lib/mailer";
import { getPaymentMethodLabel } from "@/lib/paymentMethods";

export async function POST(req: NextRequest) {
  try {
    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    console.log("[send-confirmation] request received", { orderId });

    const supabase = getSupabaseAdmin();

    // Fetch order + user email
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        `id, created_at, status, payment_method, payment_status,
         subtotal_cents, tax_cents, total_cents,
         shipping_full_name, shipping_phone, shipping_city, shipping_region,
         shipping_woreda, shipping_street,
         is_business_order, business_org_name,
         user_id`
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Get user email from auth
    const { data: authUser } = await supabase.auth.admin.getUserById(
      order.user_id
    );
    const email = authUser?.user?.email;
    if (!email) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 404 }
      );
    }

    // Fetch order items
    const { data: items } = await supabase
      .from("order_items")
      .select(
        "name_snapshot, emoji_snapshot, quantity, price_snapshot_cents, line_total_cents, color_name, size_label"
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    const orderItems = items || [];
    const createdAt = new Date(order.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const money = (cents: number) =>
      `ETB ${(cents / 100).toFixed(2)}`;

    const paymentLabel = getPaymentMethodLabel(order.payment_method);
    const shortId = order.id.slice(0, 8).toUpperCase();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hahushop.com";

    // Build item rows
    const itemRows = orderItems
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
            ${money(item.line_total_cents)}
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
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:24px;">
      <div style="font-size:32px;margin-bottom:8px;">🎉</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;">Order Confirmed!</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:14px;">
        Thank you for shopping with HahuShop
      </p>
    </div>

    <!-- Order ID & Date -->
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
          <td style="font-size:13px;color:#64748b;padding-top:8px;">Payment</td>
          <td style="text-align:right;font-size:13px;color:#334155;padding-top:8px;">${paymentLabel}</td>
        </tr>
      </table>
    </div>

    <!-- Items -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
      <div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
        <strong style="font-size:14px;color:#0f172a;">Items Ordered</strong>
      </div>
      <table width="100%" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Item</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748b;font-weight:600;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#64748b;font-weight:600;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <table width="100%" style="border-collapse:collapse;">
        <tr>
          <td style="font-size:13px;color:#64748b;padding-bottom:6px;">Subtotal</td>
          <td style="text-align:right;font-size:13px;color:#334155;padding-bottom:6px;">${money(order.subtotal_cents)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748b;padding-bottom:6px;">Shipping</td>
          <td style="text-align:right;font-size:13px;color:#10b981;padding-bottom:6px;">Free</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#64748b;padding-bottom:10px;">Tax (included)</td>
          <td style="text-align:right;font-size:13px;color:#334155;padding-bottom:10px;">${money(order.tax_cents)}</td>
        </tr>
        <tr>
          <td colspan="2" style="border-top:2px solid #e2e8f0;padding-top:10px;"></td>
        </tr>
        <tr>
          <td style="font-size:16px;font-weight:800;color:#0f172a;">Total</td>
          <td style="text-align:right;font-size:16px;font-weight:800;color:#0f172a;">${money(order.total_cents)}</td>
        </tr>
      </table>
    </div>

    <!-- Delivery Address -->
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;">📍 Delivery Address</div>
      <div style="font-size:13px;color:#334155;line-height:1.6;">
        ${order.shipping_full_name}<br>
        ${order.shipping_city}, ${order.shipping_region}
        ${order.shipping_woreda ? `<br>${order.shipping_woreda}` : ""}
        ${order.shipping_street ? `<br>${order.shipping_street}` : ""}
        <br>📞 ${order.shipping_phone}
      </div>
    </div>

    <!-- Action Buttons -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${siteUrl}/my-orders" style="display:inline-block;background:#0f172a;color:#fff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;margin-bottom:10px;">
        Track My Order
      </a>
      <br>
      <a href="${siteUrl}/contact" style="display:inline-block;color:#64748b;font-size:13px;text-decoration:underline;margin-top:10px;">
        Need help? Contact us
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        HahuShop · Ethiopia's Smart Marketplace
      </p>
      <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">
        This email was sent to ${email} because you placed an order on HahuShop.
      </p>
    </div>

  </div>
</body>
</html>`;

    // Plain text fallback
    const text = `Order Confirmed! #${shortId}

Thank you for shopping with HahuShop!

Order ID: #${shortId}
Date: ${createdAt}
Payment: ${paymentLabel}

Items:
${orderItems.map((i) => `- ${i.emoji_snapshot || ""} ${i.name_snapshot} x${i.quantity} — ${money(i.line_total_cents)}`).join("\n")}

Subtotal: ${money(order.subtotal_cents)}
Shipping: Free
Tax: ${money(order.tax_cents)}
Total: ${money(order.total_cents)}

Delivery: ${order.shipping_full_name}, ${order.shipping_city}, ${order.shipping_region}
Phone: ${order.shipping_phone}

Track your order: ${siteUrl}/my-orders
Need help? ${siteUrl}/contact

—
HahuShop · Ethiopia's Smart Marketplace`;

    // Send email
    const mailer = getMailer();
    await mailer.sendMail({
      from: SENDER_ADDRESS,
      to: email,
      subject: `Order Confirmed! #${shortId} — HahuShop`,
      html,
      text,
    });

    console.log("[send-confirmation] email sent", {
      orderId,
      email,
      shortId,
    });

    return NextResponse.json({ sent: true });
  } catch (err: any) {
    console.error("[send-confirmation]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to send email" },
      { status: 500 }
    );
  }
}
