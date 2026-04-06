// app/api/webhooks/stripe/route.ts
// Handles Stripe webhook events for payment status updates
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Disable Next.js body parser — Stripe needs the raw body for signature verification
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret === "whsec_REPLACE_ME") {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("[stripe-webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      if (!orderId) break;

      // Update order_payments
      await supabase
        .from("order_payments")
        .update({ status: "paid" })
        .eq("order_id", orderId)
        .eq("method", "stripe_card");

      // Update order payment_status
      await supabase
        .from("orders")
        .update({ payment_status: "paid" })
        .eq("id", orderId);

      console.log(`[stripe-webhook] Order ${orderId} marked as paid`);
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      if (!orderId) break;

      // Fetch existing payload so we merge instead of overwriting
      const { data: existingRec } = await supabase
        .from("order_payments")
        .select("id, raw_payload")
        .eq("order_id", orderId)
        .eq("method", "stripe_card")
        .maybeSingle();

      await supabase
        .from("order_payments")
        .update({
          status: "failed",
          raw_payload: {
            ...(existingRec?.raw_payload ?? {}),
            stripe_payment_intent_id: pi.id,
            failure_message: pi.last_payment_error?.message || "Payment failed",
          },
        })
        .eq("order_id", orderId)
        .eq("method", "stripe_card");

      // Update order payment_status
      await supabase
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("id", orderId);

      console.log(`[stripe-webhook] Order ${orderId} payment failed`);
      break;
    }

    default:
      // Unhandled event type — acknowledge receipt
      break;
  }

  return NextResponse.json({ received: true });
}
