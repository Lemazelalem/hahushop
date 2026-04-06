// lib/stripe.ts — Server-side Stripe client (test-mode ready)
// NEVER import this from client components — server-side only (API routes)
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY ?? "";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!secretKey || secretKey === "sk_test_REPLACE_ME") {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add your test key to .env.local."
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(secretKey);
  }
  return _stripe;
}
