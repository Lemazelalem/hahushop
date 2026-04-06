// app/api/checkout/create-payment-intent/route.ts
// Creates a Stripe PaymentIntent for card payments (test-mode ready)
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId } = body as { orderId?: string };

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json(
        { error: "Missing orderId" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch the order — verify it exists, is pending, and unpaid
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, total_cents, payment_status, payment_method")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    if (order.payment_status === "paid") {
      return NextResponse.json(
        { error: "Order already paid" },
        { status: 409 }
      );
    }

    if (order.payment_method !== "stripe_card") {
      return NextResponse.json(
        { error: "Order payment method is not stripe_card" },
        { status: 400 }
      );
    }

    // Check for existing PaymentIntent (idempotency — prevent duplicates)
    const { data: existingPayment } = await supabase
      .from("order_payments")
      .select("id, raw_payload")
      .eq("order_id", orderId)
      .eq("method", "stripe_card")
      .neq("status", "failed")
      .maybeSingle();

    const existingPiId =
      existingPayment?.raw_payload?.stripe_payment_intent_id;

    if (existingPiId) {
      // Return the existing client secret instead of creating a new PI
      const stripe = getStripe();
      const existingPi = await stripe.paymentIntents.retrieve(existingPiId);
      if (
        existingPi.status !== "canceled" &&
        existingPi.status !== "succeeded"
      ) {
        return NextResponse.json({
          clientSecret: existingPi.client_secret,
          paymentIntentId: existingPi.id,
        });
      }
    }

    // Create new PaymentIntent
    // Currency: ETB (Ethiopian Birr). Stripe requires lowercase ISO code.
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: order.total_cents,
      currency: "etb",
      metadata: {
        order_id: orderId,
        user_id: order.user_id,
      },
      automatic_payment_methods: { enabled: true },
    });

    // Upsert the order_payments record with stripe PI id
    if (existingPayment) {
      await supabase
        .from("order_payments")
        .update({
          raw_payload: {
            ...existingPayment.raw_payload,
            stripe_payment_intent_id: paymentIntent.id,
          },
        })
        .eq("id", existingPayment.id);
    } else {
      await supabase.from("order_payments").insert({
        order_id: orderId,
        method: "stripe_card",
        status: "pending",
        amount_cents: order.total_cents,
        raw_payload: {
          created_from: "checkout-ui",
          ui_method: "stripe_card",
          db_method: "stripe_card",
          stripe_payment_intent_id: paymentIntent.id,
        },
      });
    }

    // Mark order payment_status as pending (card flow in progress)
    await supabase
      .from("orders")
      .update({ payment_status: "pending" })
      .eq("id", orderId);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err: any) {
    console.error("[create-payment-intent]", err);
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
