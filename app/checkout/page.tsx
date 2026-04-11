// app/checkout/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import type { ItemMeta as VariantMeta } from "@/components/MiniCartProvider";
import {
  ShoppingBag,
  ArrowLeft,
  MapPin,
  CreditCard,
  Truck,
  ShieldCheck,
  Package,
  Minus,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Phone,
  User,
  Home,
  Building2,
  Navigation,
  MessageSquare,
  Smartphone,
  WalletCards,
  Clock,
  Lock,
  Sparkles,
  PartyPopper,
} from "lucide-react";
import type { CartItemKind } from "@/lib/cart";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

type ApprovedProduct = {
  id: string;
  seller_id: string | null;
  name: string;
  emoji: string | null;
  image_url: string | null;
  final_price_cents: number | null;
  public_employee_price_cents: number | null;
  rating_avg: number;
  rating_count: number;
  category: string | null;
};

type PaymentMethod =
  | "card"
  | "stripe_card"
  | "apple_pay"
  | "google_pay"
  | "paypal"
  | "ceb_link"
  | "telebirr"
  | "cbe_birr"
  | "pay_on_delivery"
  | "business_credit";

const ALLOWED_PAYMENT_METHODS: PaymentMethod[] = [
  "pay_on_delivery",
  "stripe_card",
  "ceb_link",
  "telebirr",
  "business_credit",
];

const ACTIVE_PAYMENT_METHODS: PaymentMethod[] = [
  "pay_on_delivery",
  "stripe_card",
  "business_credit",
];

const COMING_SOON_METHODS: PaymentMethod[] = ["ceb_link", "telebirr"];

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  badge: string;
  description: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  status: "active" | "coming_soon" | "locked";
  disabled?: boolean;
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: "pay_on_delivery",
    label: "Pay on Delivery",
    badge: "Cash / POS on arrival",
    description: "Pay when the order is delivered to you.",
    Icon: Truck,
    status: "active",
  },
  {
    id: "ceb_link",
    label: "CEB Credit Link",
    badge: "Pay via link",
    description: "We send you a CEB payment link by SMS / email.",
    Icon: WalletCards,
    status: "coming_soon",
  },
  {
    id: "telebirr",
    label: "telebirr",
    badge: "Ethio telecom",
    description: "Pay from your telebirr mobile wallet.",
    Icon: Smartphone,
    status: "coming_soon",
  },
  {
    id: "stripe_card",
    label: "Credit / Debit Card",
    badge: "Visa · Mastercard",
    description: "Pay securely with any supported bank card.",
    Icon: CreditCard,
    status: "active",
  },
  {
    id: "cbe_birr",
    label: "CBE Birr",
    badge: "CBE wallet",
    description: "Pay from your CBE Birr wallet.",
    Icon: Smartphone,
    status: "locked",
    disabled: true,
  },
  {
    id: "apple_pay",
    label: "Apple Pay",
    badge: "iPhone / Safari",
    description: "Quick checkout from Apple devices.",
    Icon: Smartphone,
    status: "locked",
    disabled: true,
  },
  {
    id: "google_pay",
    label: "Google Pay",
    badge: "Android / Chrome",
    description: "Use your saved cards in Google.",
    Icon: Smartphone,
    status: "locked",
    disabled: true,
  },
  {
    id: "paypal",
    label: "PayPal",
    badge: "Balance or card",
    description: "Pay from your PayPal wallet.",
    Icon: WalletCards,
    status: "locked",
    disabled: true,
  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function money(cents?: number | null) {
  if (!cents || cents <= 0) return "ETB 0.00";
  return `ETB ${(cents / 100).toFixed(2)}`;
}

function moneyShort(cents?: number | null) {
  if (!cents || cents <= 0) return "ETB 0";
  return `ETB ${(cents / 100).toFixed(0)}`;
}

function readCartQty(item: any): number {
  const q = Number(item?.qty ?? item?.quantity ?? 0);
  return Number.isFinite(q) ? q : 0;
}

/**
 * Stable composite key that keeps separate color/size combos of the same
 * product as distinct line items throughout checkout.
 */
function variantLineKey(
  kind: string,
  productId: string,
  meta: VariantMeta | null | undefined,
): string {
  const cv = meta?.colorVariantId ?? "";
  const sv = meta?.sizeVariantId ?? "";
  return `${kind}:${productId}:${cv}:${sv}`;
}

function sectionTitleClassMobile() {
  return "text-[13px] font-black tracking-[-0.02em] text-slate-900";
}

/* ─── Order Success Overlay ──────────────────────────────────────────────────── */

function OrderSuccessOverlay({
  message,
  isBusinessOrder,
  totalCents,
  itemCount,
}: {
  message: string;
  isBusinessOrder: boolean;
  totalCents: number;
  itemCount: number;
}) {
  return (
    <div className="w-full flex flex-col items-center justify-center min-h-screen">
      <div className="relative mx-4 w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Top accent bar */}
        <div
          className="h-1.5 w-full"
          style={{
            background: isBusinessOrder
              ? "linear-gradient(90deg,#0f172a,#1d4ed8,#a3e635)"
              : "linear-gradient(90deg,#10b981,#34d399,#6ee7b7)",
          }}
        />

        <div className="px-6 pt-8 pb-6 text-center">
          {/* Animated checkmark circle */}
          <div
            className={`mx-auto mb-5 w-20 h-20 rounded-full flex items-center justify-center shadow-lg ${
              isBusinessOrder
                ? "bg-gradient-to-br from-slate-900 to-blue-800"
                : "bg-gradient-to-br from-emerald-400 to-emerald-600"
            }`}
          >
            <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2} />
          </div>

          <h2 className="text-2xl font-black text-slate-900 mb-1">
            Order Placed!
          </h2>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">{message}</p>

          {/* Mini summary pill */}
          <div className="inline-flex items-center gap-3 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-2.5 mb-5">
            <div className="text-left">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Total charged
              </div>
              <div className="text-lg font-black text-slate-900 leading-tight">
                {money(totalCents)}
              </div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-left">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Items
              </div>
              <div className="text-lg font-black text-slate-900 leading-tight">
                {itemCount}
              </div>
            </div>
          </div>

          {/* What happens next */}
          <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-left mb-5 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              What happens next
            </p>
            {isBusinessOrder ? (
              <>
                <Step icon="📋" text="Invoice sent to your organization" />
                <Step icon="📦" text="Order prepared & dispatched within 24 h" />
                <Step icon="🏢" text="Delivered to your registered office" />
              </>
            ) : (
              <>
                <Step icon="📦" text="We'll prepare your order right away" />
                <Step icon="🛵" text="Courier dispatched within 24 hours" />
                <Step icon="💵" text="Pay cash or card on delivery" />
              </>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Redirecting to your orders…
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[11px] text-slate-600 font-medium">{text}</span>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, removeItem, setQty, clearCart } = useMiniCart();

  const [approvedProducts, setApprovedProducts] = useState<ApprovedProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [shippingFullName, setShippingFullName] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [shippingRegion, setShippingRegion] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingWoreda, setShippingWoreda] = useState("");
  const [shippingKebele, setShippingKebele] = useState("");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingDetails, setShippingDetails] = useState("");

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("pay_on_delivery");
  const [paymentExpanded, setPaymentExpanded] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  // ── NEW: controls the full-screen success overlay ──
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderSummary, setOrderSummary] = useState<{ total: number; itemCount: number } | null>(null);

  const [businessProfile, setBusinessProfile] = useState<{
    is_business_account: boolean;
    business_org_name: string | null;
    business_payment_terms: "net_30" | "net_60" | null;
  } | null>(null);

  /* ── Business profile ───────────────────────────────────────────────────── */

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("is_business_account, business_org_name, business_payment_terms")
        .eq("id", user.id)
        .maybeSingle();

      if (data?.is_business_account) {
        setBusinessProfile({
          is_business_account: true,
          business_org_name: data.business_org_name ?? null,
          business_payment_terms: data.business_payment_terms ?? "net_30",
        });
        setPaymentMethod("business_credit");
      }
    }
    load();
  }, []);

  /* ── Cart items that come from Supabase products ────────────────────────── */

  const supabaseItemsInCart = useMemo(
    () => cart.filter((i) => i.kind === "approved" || i.kind === "approved_public"),
    [cart],
  );

  const displayedItemCount = useMemo(
    () => supabaseItemsInCart.reduce((s, i) => s + readCartQty(i), 0),
    [supabaseItemsInCart],
  );

  /* ── Load product rows ──────────────────────────────────────────────────── */

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!supabaseItemsInCart.length) {
        if (alive) {
          setApprovedProducts([]);
          setLoadingProducts(false);
          setPageError(null);
        }
        return;
      }

      if (alive) {
        setLoadingProducts(true);
        setPageError(null);
      }

      try {
        const ids = Array.from(new Set(supabaseItemsInCart.map((i) => i.id)));

        const { data, error } = await supabase
          .from("products")
          .select(
            "id, seller_id, name, emoji, image_url, final_price_cents, public_employee_price_cents, rating_avg, rating_count, categories(name)",
          )
          .in("id", ids);

        if (!alive) return;

        if (error) {
          setPageError(error.message || "Could not load cart products.");
          setApprovedProducts([]);
          return;
        }

        setApprovedProducts(
          (data ?? []).map((r: any) => ({
            id: r.id,
            seller_id: r.seller_id ?? null,
            name: r.name,
            emoji: r.emoji ?? null,
            image_url: r.image_url ?? null,
            final_price_cents: r.final_price_cents ?? null,
            public_employee_price_cents: r.public_employee_price_cents ?? null,
            rating_avg: r.rating_avg ?? 0,
            rating_count: r.rating_count ?? 0,
            category:
              r.categories?.[0]?.name ??
              r.categories?.name ??
              "Uncategorized",
          })),
        );
      } catch (err: any) {
        if (alive) {
          setPageError(err?.message || "Could not load cart products.");
          setApprovedProducts([]);
        }
      } finally {
        if (alive) setLoadingProducts(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [supabaseItemsInCart]);

  /* ── Derived: merged line items + totals ────────────────────────────────── */

  const hasAnyItems = displayedItemCount > 0;

  const { subtotalCents, taxCents, totalCents, snapshotItems, mergedItems } =
    useMemo(() => {
      let subtotal = 0;

      const snap: Array<{
        kind: "approved" | "approved_public";
        product_id: string;
        name_snapshot: string;
        emoji_snapshot: string;
        image_url_snapshot: string | null;
        seller_id: string | null;
        qty: number;
        unit_price_cents: number;
        line_total_cents: number;
        price_tier: "customer" | "public_employee";
        color_name: string | null;
        size_label: string | null;
        color_variant_id: string | null;
        size_variant_id: string | null;
      }> = [];

      const merged: Array<{
        key: string;
        kind: CartItemKind;
        id: string;
        name: string;
        image: string | null;
        emoji: string | null;
        category: string;
        unitPriceCents: number;
        quantity: number;
        lineTotalCents: number;
        isPublicEmployee: boolean;
        cartMeta: VariantMeta | undefined;
        colorName: string | null;
        sizeLabel: string | null;
      }> = [];

      const lineMap = new Map<
        string,
        {
          kind: CartItemKind;
          productId: string;
          qty: number;
          meta: VariantMeta;
        }
      >();

      for (const item of supabaseItemsInCart) {
        const meta: VariantMeta = {
          colorVariantId: (item as any).colorVariantId ?? null,
          colorName: (item as any).colorName ?? null,
          sizeVariantId: (item as any).sizeVariantId ?? null,
          sizeLabel: (item as any).sizeLabel ?? null,
          priceAdjustCents: (item as any).priceAdjustCents ?? 0,
          finalPriceCents: (item as any).finalPriceCents ?? undefined,
          overridePriceCents: (item as any).overridePriceCents ?? null,
        };

        const key = variantLineKey(item.kind, String(item.id), meta);
        const existing = lineMap.get(key);

        if (existing) {
          existing.qty += readCartQty(item);
        } else {
          lineMap.set(key, {
            kind: item.kind,
            productId: String(item.id),
            qty: readCartQty(item),
            meta,
          });
        }
      }

      const productById: Record<string, ApprovedProduct> = {};
      for (const p of approvedProducts) productById[p.id] = p;

      for (const [key, line] of lineMap.entries()) {
        if (line.qty <= 0) continue;
        const p = productById[line.productId];
        if (!p) continue;

        const isPublicEmployee = line.kind === "approved_public";
        let unit: number;

        if (isPublicEmployee) {
          const peBase =
            line.meta.overridePriceCents ??
            p.public_employee_price_cents ??
            p.final_price_cents ??
            0;
          const adjust = line.meta.priceAdjustCents ?? 0;
          unit = line.meta.finalPriceCents ?? (peBase + adjust);
        } else {
          const base = p.final_price_cents ?? 0;
          const adjust = line.meta.priceAdjustCents ?? 0;
          unit = line.meta.finalPriceCents ?? (adjust > 0 ? base + adjust : base);
        }

        if (unit <= 0) continue;

        const lineTotal = unit * line.qty;
        subtotal += lineTotal;

        const hasVariantOrPrice =
          line.meta.colorVariantId ||
          line.meta.sizeVariantId ||
          line.meta.overridePriceCents != null ||
          line.meta.finalPriceCents != null;

        const cartMeta: VariantMeta | undefined = hasVariantOrPrice
          ? line.meta
          : undefined;

        snap.push({
          kind: line.kind as "approved" | "approved_public",
          product_id: p.id,
          name_snapshot: p.name,
          emoji_snapshot: p.emoji ?? "🛍️",
          image_url_snapshot: p.image_url ?? null,
          seller_id: p.seller_id ?? null,
          qty: line.qty,
          unit_price_cents: unit,
          line_total_cents: lineTotal,
          price_tier: isPublicEmployee ? "public_employee" : "customer",
          color_name: line.meta.colorName ?? null,
          size_label: line.meta.sizeLabel ?? null,
          color_variant_id: line.meta.colorVariantId ?? null,
          size_variant_id: line.meta.sizeVariantId ?? null,
        });

        merged.push({
          key,
          kind: line.kind,
          id: p.id,
          name: p.name,
          image: p.image_url,
          emoji: p.emoji,
          category: p.category ?? "Uncategorized",
          unitPriceCents: unit,
          quantity: line.qty,
          lineTotalCents: lineTotal,
          isPublicEmployee,
          cartMeta,
          colorName: line.meta.colorName ?? null,
          sizeLabel: line.meta.sizeLabel ?? null,
        });
      }

      return {
        subtotalCents: subtotal,
        taxCents: 0,
        totalCents: subtotal,
        snapshotItems: snap,
        mergedItems: merged,
      };
    }, [approvedProducts, supabaseItemsInCart]);

  /* ── Validation helpers ─────────────────────────────────────────────────── */

  function isShippingValid() {
    return (
      shippingFullName.trim().length > 0 &&
      shippingPhone.trim().length > 0 &&
      shippingRegion.trim().length > 0 &&
      shippingCity.trim().length > 0
    );
  }

  const isPaymentMethodActive = ACTIVE_PAYMENT_METHODS.includes(paymentMethod);

  /* ── Place order ────────────────────────────────────────────────────────── */

  async function handlePlaceOrder() {
    console.log("🛒 Checkout started. hasAnyItems:", hasAnyItems, "snapshotItems:", snapshotItems.length);
    setOrderError(null);
    setOrderSuccess(null);

    if (!hasAnyItems) {
      console.warn("⚠️ No items in cart");
      setOrderError("Your cart is empty.");
      return;
    }
    if (!isShippingValid()) {
      setOrderError("Please fill in Name, Phone, Region and City.");
      return;
    }
    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      setOrderError("Payment method not available.");
      return;
    }
    if (COMING_SOON_METHODS.includes(paymentMethod)) {
      setOrderError(
        `${
          PAYMENT_OPTIONS.find((o) => o.id === paymentMethod)?.label
        } is coming soon. Please use Pay on Delivery.`,
      );
      return;
    }
    if (!snapshotItems.length || totalCents <= 0) {
      setOrderError("Could not compute totals. Please refresh and try again.");
      return;
    }

    try {
      setPlacingOrder(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        setOrderError("You must be signed in.");
        return;
      }
      const user = userData.user;

      const dbPaymentMethod =
        paymentMethod === "business_credit"
          ? "net_credit"
          : paymentMethod === "telebirr" || paymentMethod === "cbe_birr"
          ? "wallet_credit"
          : paymentMethod === "pay_on_delivery"
          ? "cash_on_delivery"
          : paymentMethod === "stripe_card"
          ? "stripe_card"
          : paymentMethod;

      const termDays =
        businessProfile?.business_payment_terms === "net_60" ? 60 : 30;
      const creditDueDate = businessProfile?.is_business_account
        ? new Date(Date.now() + termDays * 86400_000).toISOString()
        : null;

      const shipping = {
        full_name: shippingFullName.trim(),
        phone: shippingPhone.trim(),
        region: shippingRegion.trim(),
        city: shippingCity.trim(),
        woreda: shippingWoreda.trim() || null,
        kebele: shippingKebele.trim() || null,
        street: shippingStreet.trim() || null,
        details: shippingDetails.trim() || null,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          status: "pending",
          payment_status: "unpaid",
          payment_method: dbPaymentMethod,
          subtotal_cents: subtotalCents,
          tax_cents: taxCents,
          total_cents: totalCents,
          shipping_full_name: shipping.full_name,
          shipping_phone: shipping.phone,
          shipping_region: shipping.region,
          shipping_city: shipping.city,
          shipping_woreda: shipping.woreda,
          shipping_kebele: shipping.kebele,
          shipping_street: shipping.street,
          shipping_details: shipping.details,
          is_business_order: businessProfile?.is_business_account === true,
          business_org_name: businessProfile?.business_org_name ?? null,
          business_payment_terms:
            businessProfile?.business_payment_terms ?? null,
          business_credit_due_date: creditDueDate,
          cart_snapshot: {
            items: snapshotItems,
            subtotal_cents: subtotalCents,
            tax_cents: taxCents,
            total_cents: totalCents,
            shipping,
            payment_method: paymentMethod,
          },
        })
        .select("id")
        .maybeSingle();

      if (insertError || !inserted) {
        console.error("❌ Order insert failed:", insertError);
        setOrderError(insertError?.message || "Could not create order.");
        return;
      }

      console.log("✅ Order created successfully:", inserted.id);
      const orderId = inserted.id as string;

      try {
        const payload = snapshotItems.map((s) => ({
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

        if (payload.length) {
          const { error } = await supabase.from("order_items").insert(payload);
          if (error) console.warn("order_items insert:", error);
        }
      } catch (e) {
        console.warn("order_items skipped:", e);
      }

      try {
        await supabase.from("order_payments").insert({
          order_id: orderId,
          method: dbPaymentMethod,
          status: "pending",
          amount_cents: totalCents,
          raw_payload: {
            created_from: "checkout-ui",
            ui_method: paymentMethod,
            db_method: dbPaymentMethod,
            wallet_provider:
              paymentMethod === "telebirr"
                ? "telebirr"
                : paymentMethod === "cbe_birr"
                ? "cbe_birr"
                : null,
          },
        });
      } catch (e) {
        console.warn("order_payments insert:", e);
      }

      // ── Stripe card flow: create PaymentIntent then redirect ──
      if (paymentMethod === "stripe_card") {
        try {
          const piRes = await fetch("/api/checkout/create-payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
          });
          const piData = await piRes.json();
          if (!piRes.ok || !piData.clientSecret) {
            setOrderError(piData.error || "Could not start card payment.");
            return;
          }
          // Store for future Stripe Elements confirmation step
          // For now, show success — actual card form will be added in a later step
          console.log("✅ Stripe PaymentIntent created:", piData.paymentIntentId);
        } catch (piErr: any) {
          console.error("Stripe PI error:", piErr);
          setOrderError("Could not connect to payment service. Please try again.");
          return;
        }
      }

      const successMsg =
        paymentMethod === "business_credit"
          ? `Order placed on ${
              businessProfile?.business_payment_terms === "net_60"
                ? "Net-60"
                : "Net-30"
            } credit. Invoice will be sent to your organization.`
          : paymentMethod === "stripe_card"
          ? "Order placed! Card payment is being processed."
          : "Order placed! Please prepare payment when the courier arrives.";

      // Save order summary BEFORE clearing so we have the data for the overlay
      setOrderSummary({
        total: totalCents,
        itemCount: displayedItemCount || snapshotItems.reduce((s, i) => s + i.qty, 0),
      });

      // Set orderPlaced FIRST to prevent empty cart render
      setOrderPlaced(true);
      
      // Now clear the cart
      clearCart();

      setOrderSuccess(successMsg);

      // Let the confirmation request continue even if we navigate away right after checkout.
      void fetch("/api/orders/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
        keepalive: true,
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res
              .json()
              .catch(() => ({ error: "Unknown confirmation email error" }));
            console.warn("Confirmation email failed:", data.error || res.status);
          }
        })
        .catch((e) => console.warn("Confirmation email failed:", e));

      console.log("✨ Order success overlay should be visible now");
      setTimeout(() => {
        console.log("🔄 Redirecting to /my-orders");
        router.push("/my-orders");
      }, 3000);
    } catch (err: any) {
      setOrderError(err?.message || "Unexpected error while placing order.");
    } finally {
      setPlacingOrder(false);
    }
  }

  /* ── Empty state ────────────────────────────────────────────────────────── */

  if (!hasAnyItems && !loadingProducts && !orderPlaced && !placingOrder) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-3">
            <button
              onClick={() => router.push("/shop")}
              className="hover:text-slate-900"
            >
              Shop
            </button>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-900 font-medium">Checkout</span>
          </nav>

          <h1 className="text-2xl font-bold text-slate-900 mb-6">Checkout</h1>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Your cart is empty
            </h2>
            <p className="text-slate-600 mb-6 max-w-sm mx-auto text-sm">
              Looks like you haven&apos;t added anything yet.
            </p>
            <button
              onClick={() => router.push("/shop")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-sm"
            >
              Continue Shopping <ArrowLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isBusinessOrder = businessProfile?.is_business_account === true;

  /* ── Main render ────────────────────────────────────────────────────────── */

  // ── If order was just placed, show success screen as THE page (no z-index issues) ──
  if (orderPlaced && orderSuccess && orderSummary) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <OrderSuccessOverlay
          message={orderSuccess}
          isBusinessOrder={isBusinessOrder}
          totalCents={orderSummary.total}
          itemCount={orderSummary.itemCount}
        />
      </main>
    );
  }

  return (
    <main className="bg-slate-50">

      {/* ─ Hide checkout form while order is being processed ─ */}
      {/* ───────────────── MOBILE ───────────────── */}
      {/* ═══════════════════════ MOBILE ═══════════════════════ */}
<div className="md:hidden min-h-screen bg-[#f5f5f5] pb-32">

  {/* Top bar */}
  <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
    <div className="px-3 py-2 flex items-center justify-between">
      <button onClick={() => router.push("/shop")} className="flex items-center gap-1 text-slate-800">
        <ArrowLeft className="w-4 h-4" />
        <span className="text-[12px] font-semibold">Shop</span>
      </button>
      <div className="text-center">
        <div className="text-[13px] font-black text-slate-900">Checkout</div>
        <div className="text-[9px] text-slate-500">{displayedItemCount} item{displayedItemCount !== 1 ? "s" : ""}</div>
      </div>
      <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
        <ShieldCheck className="w-3 h-3 text-emerald-600" />
        <span className="text-[9px] font-semibold text-slate-700">Secure</span>
      </div>
    </div>
  </div>

  <div className="px-2 pt-2 space-y-2">

    {pageError && (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
        <span className="text-[11px] text-rose-700">{pageError}</span>
      </div>
    )}

    {/* Business banner */}
    {isBusinessOrder && (
      <section className="rounded-2xl px-3 py-3 text-white" style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#1d4ed8 100%)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-lime-300" />
          </div>
          <div>
            <div className="text-[12px] font-black">
              Paying on {businessProfile.business_payment_terms === "net_60" ? "Net-60" : "Net-30"} credit
            </div>
            <div className="text-[10px] text-white/70">
              {businessProfile.business_org_name ?? "Your Organization"} · invoice due in {businessProfile.business_payment_terms === "net_60" ? "60" : "30"} days
            </div>
          </div>
        </div>
      </section>
    )}

    {/* ── Items ── */}
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <span className="text-[12px] font-black text-slate-900">Your items</span>
        <button onClick={() => router.push("/shop")} className="text-[10px] font-bold text-slate-500">+ Add more</button>
      </div>

      {loadingProducts ? (
        <div className="p-4 text-center">
          <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-slate-900 rounded-full mx-auto mb-1" />
          <span className="text-[11px] text-slate-500">Loading…</span>
        </div>
      ) : mergedItems.length === 0 ? (
        <div className="p-4 text-center text-[11px] text-slate-500">No valid items in cart.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {mergedItems.map((item) => (
            <div key={item.key} className="p-2.5 flex gap-2.5">
              <div
                onClick={() => router.push(`/shop/${item.id}`)}
                className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 cursor-pointer active:scale-95 transition-transform"
              >
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">{item.emoji ?? "📦"}</div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 flex-wrap mb-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{item.category}</span>
                      {item.isPublicEmployee && (
                        <span className="px-1 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[8px] font-black">Employee</span>
                      )}
                    </div>
                    <h3
                      onClick={() => router.push(`/shop/${item.id}`)}
                      className="text-[12px] leading-tight font-bold text-slate-900 line-clamp-2 cursor-pointer"
                    >
                      {item.name}
                    </h3>
                    {(item.colorName || item.sizeLabel) && (
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        {item.colorName && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full inline-block border border-slate-300" style={{ background: item.colorName.toLowerCase() }} />
                            {item.colorName}
                          </span>
                        )}
                        {item.sizeLabel && (
                          <span className="inline-flex items-center text-[9px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200">
                            {item.sizeLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.kind, item.id, item.cartMeta)}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 bg-slate-100 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[15px] leading-none font-black text-slate-900">{moneyShort(item.lineTotalCents)}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">{money(item.unitPriceCents)} ea</div>
                  </div>
                  <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 overflow-hidden">
                    <button
                      onClick={() => setQty(item.kind, item.id, item.quantity - 1, item.cartMeta)}
                      disabled={item.quantity <= 1}
                      className="w-8 h-8 flex items-center justify-center text-slate-700 disabled:opacity-40"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="min-w-[26px] text-center text-[11px] font-black text-slate-900">{item.quantity}</span>
                    <button
                      onClick={() => setQty(item.kind, item.id, item.quantity + 1, item.cartMeta)}
                      className="w-8 h-8 flex items-center justify-center text-slate-700"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>

    {/* ── Delivery ── */}
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100">
        <span className="text-[12px] font-black text-slate-900">Delivery details</span>
      </div>
      <div className="p-2.5">
        <div className="grid grid-cols-2 gap-2">
          {/* Full Name */}
          <div className="col-span-2">
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1"><User className="w-3 h-3" />Full Name<span className="text-rose-500">*</span></label>
            <input type="text" value={shippingFullName} onChange={(e) => setShippingFullName(e.target.value)} placeholder="Abebe Kebede" className="w-full h-9 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-900" />
          </div>
          {/* Phone */}
          <div className="col-span-2">
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1"><Phone className="w-3 h-3" />Phone<span className="text-rose-500">*</span></label>
            <input type="tel" value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} placeholder="0911 234 567" className="w-full h-9 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-900" />
          </div>
          {/* Region */}
          <div>
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1"><Building2 className="w-3 h-3" />Region<span className="text-rose-500">*</span></label>
            <input type="text" value={shippingRegion} onChange={(e) => setShippingRegion(e.target.value)} placeholder="Addis Ababa" className="w-full h-9 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-900" />
          </div>
          {/* City */}
          <div>
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1"><Home className="w-3 h-3" />City<span className="text-rose-500">*</span></label>
            <input type="text" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} placeholder="Kirkos" className="w-full h-9 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-900" />
          </div>
          {/* Woreda */}
          <div>
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1">Woreda</label>
            <input type="text" value={shippingWoreda} onChange={(e) => setShippingWoreda(e.target.value)} placeholder="Woreda 08" className="w-full h-9 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-900" />
          </div>
          {/* Kebele */}
          <div>
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1">Kebele</label>
            <input type="text" value={shippingKebele} onChange={(e) => setShippingKebele(e.target.value)} placeholder="Kebele 15" className="w-full h-9 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-900" />
          </div>
          {/* Street */}
          <div className="col-span-2">
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1"><Navigation className="w-3 h-3" />Street / Landmark</label>
            <input type="text" value={shippingStreet} onChange={(e) => setShippingStreet(e.target.value)} placeholder="Near Edna Mall" className="w-full h-9 rounded-xl border border-slate-300 bg-slate-50 px-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-900" />
          </div>
        </div>
        {/* Instructions */}
        <div className="mt-2">
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1"><MessageSquare className="w-3 h-3" />Delivery Instructions</label>
          <textarea
            value={shippingDetails}
            onChange={(e) => { const words = e.target.value.trim().split(/\s+/).filter(Boolean); if (words.length <= 100) setShippingDetails(e.target.value); }}
            rows={2}
            placeholder="Call when arriving…"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-slate-900 resize-none"
          />
          <div className="text-right text-[9px] text-slate-400">
            {shippingDetails.trim().split(/\s+/).filter(Boolean).length}/100
          </div>
        </div>
      </div>
    </section>

    {/* ── Payment ── */}
    {!isBusinessOrder && (() => {
      const activeOpts = PAYMENT_OPTIONS.filter((o) => o.status === "active");
      const otherOpts = PAYMENT_OPTIONS.filter((o) => o.status !== "active");
      const allVisible = paymentExpanded ? [...activeOpts, ...otherOpts] : activeOpts;

      return (
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[12px] font-black text-slate-900">Payment</span>
            <span className="ml-auto text-[9px] text-slate-400">Secure &amp; encrypted</span>
          </div>

          <div className="divide-y divide-slate-100">
            {allVisible.map((opt) => {
              const selected = paymentMethod === opt.id;
              const Icon = opt.Icon;
              const isLocked = opt.status === "locked";
              const isComingSoon = opt.status === "coming_soon";

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { if (!isLocked) setPaymentMethod(opt.id); }}
                  disabled={isLocked}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                    isLocked ? "opacity-40 cursor-not-allowed" : "active:bg-slate-50"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    selected ? "bg-slate-900" : isComingSoon ? "bg-amber-50" : "bg-slate-100"
                  }`}>
                    <Icon className={`w-4 h-4 ${selected ? "text-white" : isComingSoon ? "text-amber-600" : "text-slate-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold text-slate-900">{opt.label}</span>
                      {isComingSoon && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-100 text-amber-700">Soon</span>
                      )}
                      {isLocked && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-400">Locked</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{opt.badge}</div>
                  </div>
                  {/* Radio circle */}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    selected ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                  }`}>
                    {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* View more / less toggle */}
          {otherOpts.length > 0 && (
            <button
              type="button"
              onClick={() => setPaymentExpanded((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-slate-100 text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              {paymentExpanded ? "Show less" : `View ${otherOpts.length} more payment methods`}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${paymentExpanded ? "rotate-180" : ""}`} />
            </button>
          )}

          {/* Info callouts */}
          <div className="px-3.5 pb-3">
            {paymentMethod === "pay_on_delivery" && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[10px] text-emerald-800 flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 shrink-0" />Pay cash or POS when the courier arrives.
              </div>
            )}
            {paymentMethod === "stripe_card" && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-[10px] text-blue-800 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />Secure card payment powered by Stripe.
              </div>
            )}
            {(paymentMethod === "ceb_link" || paymentMethod === "telebirr") && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[10px] text-amber-800 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 shrink-0" />Coming soon — please use Pay on Delivery.
              </div>
            )}
          </div>
        </section>
      );
    })()}

    {/* ── Summary ── */}
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100">
        <span className="text-[12px] font-black text-slate-900">Summary</span>
      </div>
      <div className="p-2.5">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span>Subtotal ({displayedItemCount} items)</span>
            <span className="font-bold text-slate-900">{money(subtotalCents)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span>Shipping</span>
            <span className="font-bold text-emerald-600">Free</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span>Tax</span>
            <span className="font-bold text-slate-900">{money(taxCents)}</span>
          </div>
          <div className="h-px bg-slate-200" />
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] font-semibold text-slate-500">Total</div>
              <div className="text-[20px] leading-none font-black text-slate-900 mt-0.5">{money(totalCents)}</div>
            </div>
            <div className="text-right text-[9px] text-slate-500">
              {isBusinessOrder ? "Invoice later" : "Pay on delivery"}
            </div>
          </div>
        </div>

        {orderError && (
          <div className="mt-2 rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-2 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
            <span className="text-[10px] text-rose-700">{orderError}</span>
          </div>
        )}
      </div>
    </section>

  </div>

  {/* Sticky bottom bar */}
  <div className="fixed bottom-0 inset-x-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]">
    <div className="px-3 py-2.5 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Total</div>
        <div className="text-[20px] leading-none font-black text-slate-900">{money(totalCents)}</div>
        <div className="text-[9px] text-slate-500">{displayedItemCount} item{displayedItemCount !== 1 ? "s" : ""} · free shipping</div>
      </div>
      <button
        type="button"
        disabled={placingOrder || !hasAnyItems || !isShippingValid() || !isPaymentMethodActive}
        onClick={handlePlaceOrder}
        className="h-11 px-5 rounded-full bg-[#ff0050] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black text-[12px] shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {placingOrder ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing</>
        ) : !isPaymentMethodActive ? (
          <>Select payment <Lock className="w-3.5 h-3.5" /></>
        ) : isBusinessOrder ? (
          <>Place on Credit</>
        ) : (
          <>Place Order</>
        )}
      </button>
    </div>
  </div>

</div>

      {/* ───────────────── DESKTOP ───────────────── */}
      <div className="hidden md:block">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <div className="mb-6">
            <nav className="flex items-center gap-2 text-sm text-slate-500 mb-3">
              <button
                onClick={() => router.push("/shop")}
                className="hover:text-slate-900 transition-colors"
              >
                Shop
              </button>
              <ChevronRight className="w-4 h-4" />
              <button
                onClick={() => router.push("/cart")}
                className="hover:text-slate-900 transition-colors"
              >
                Cart
              </button>
              <ChevronRight className="w-4 h-4" />
              <span className="text-slate-900 font-medium">Checkout</span>
            </nav>

            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900">
                Secure Checkout
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-white px-2 py-1 rounded-full border border-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">SSL Secure</span>
              </div>
            </div>
          </div>

          {pageError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="font-medium text-rose-900">Error: </span>
                <span className="text-rose-700">{pageError}</span>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left column */}
            <div className="lg:col-span-7 space-y-4">
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-slate-500" />
                    Order Items ({displayedItemCount})
                  </h2>
                  <button
                    onClick={() => router.push("/shop")}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Add items
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {loadingProducts ? (
                    <div className="p-6 text-center text-slate-500">
                      <div className="animate-spin w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full mx-auto mb-2" />
                      <span className="text-sm">Loading items…</span>
                    </div>
                  ) : mergedItems.length === 0 ? (
                    <div className="p-6 text-center text-slate-500">
                      <p className="text-sm">No valid items in cart.</p>
                      <button
                        onClick={() => router.push("/shop")}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Go to Shop
                      </button>
                    </div>
                  ) : (
                    mergedItems.map((item) => (
                      <div
                        key={item.key}
                        className="p-3 flex gap-3 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-slate-200">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xl">{item.emoji ?? "📦"}</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">
                                  {item.category}
                                </span>
                                {item.isPublicEmployee && (
                                  <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
                                    Employee Price
                                  </span>
                                )}
                              </div>

                              <h3 className="font-medium text-slate-900 text-sm leading-tight truncate">
                                {item.name}
                              </h3>

                              {(item.colorName || item.sizeLabel) && (
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {item.colorName && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                      <span
                                        className="w-2 h-2 rounded-full inline-block border border-slate-300"
                                        style={{
                                          background: item.colorName.toLowerCase(),
                                        }}
                                      />
                                      {item.colorName}
                                    </span>
                                  )}
                                  {item.sizeLabel && (
                                    <span className="inline-flex items-center text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                      Size: {item.sizeLabel}
                                    </span>
                                  )}
                                  <button
                                    onClick={() =>
                                      router.push(`/shop/${item.id}`)
                                    }
                                    className="text-[10px] text-blue-500 hover:text-blue-700 underline underline-offset-2"
                                  >
                                    Change
                                  </button>
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() =>
                                removeItem(item.kind, item.id, item.cartMeta)
                              }
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors shrink-0"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center border border-slate-200 rounded-md bg-white">
                              <button
                                onClick={() =>
                                  setQty(
                                    item.kind,
                                    item.id,
                                    item.quantity - 1,
                                    item.cartMeta,
                                  )
                                }
                                disabled={item.quantity <= 1}
                                className="p-1.5 hover:bg-slate-100 text-slate-600 disabled:opacity-40"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-8 text-center text-xs font-semibold text-slate-900">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() =>
                                  setQty(
                                    item.kind,
                                    item.id,
                                    item.quantity + 1,
                                    item.cartMeta,
                                  )
                                }
                                className="p-1.5 hover:bg-slate-100 text-slate-600"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="text-right">
                              <div className="font-bold text-slate-900 text-sm">
                                {money(item.lineTotalCents)}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {money(item.unitPriceCents)}/ea
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-500" />
                    Delivery Address (Ethiopia)
                  </h2>
                </div>

                <div className="p-4 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                        <User className="w-3 h-3" /> Full Name{" "}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={shippingFullName}
                        onChange={(e) => setShippingFullName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="Abebe Kebede"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone Number{" "}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={shippingPhone}
                        onChange={(e) => setShippingPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="0911 234 567"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> Region{" "}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={shippingRegion}
                        onChange={(e) => setShippingRegion(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="Addis Ababa"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                        <Home className="w-3 h-3" /> City / Zone{" "}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={shippingCity}
                        onChange={(e) => setShippingCity(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="Kirkos"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Woreda{" "}
                        <span className="text-slate-400 font-normal">
                          (optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={shippingWoreda}
                        onChange={(e) => setShippingWoreda(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="Woreda 08"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Kebele{" "}
                        <span className="text-slate-400 font-normal">
                          (optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={shippingKebele}
                        onChange={(e) => setShippingKebele(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="Kebele 15"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                      <Navigation className="w-3 h-3" /> Street / Landmark{" "}
                      <span className="text-slate-400 font-normal">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={shippingStreet}
                      onChange={(e) => setShippingStreet(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder="Near Edna Mall, Cameroon St"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> Delivery Instructions{" "}
                      <span className="text-slate-400 font-normal">
                        (optional, max 100 words)
                      </span>
                    </label>
                    <textarea
                      value={shippingDetails}
                      onChange={(e) => {
                        const words = e.target.value
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean);
                        if (words.length <= 100) setShippingDetails(e.target.value);
                      }}
                      rows={3}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                      placeholder="Call when arriving. Leave with security if not available…"
                    />
                    <div className="mt-1 text-right text-[10px] text-slate-400">
                      {shippingDetails.trim().split(/\s+/).filter(Boolean).length}
                      /100 words
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right column */}
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-4 space-y-3">
                {isBusinessOrder ? (
                  <section
                    className="rounded-xl p-4 flex items-start gap-3"
                    style={{
                      background: "linear-gradient(135deg,#0f172a,#1e293b)",
                      border: "1px solid rgba(163,230,53,0.25)",
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
                      style={{
                        background: "linear-gradient(135deg,#a3e635,#22d3ee)",
                      }}
                    >
                      💳
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-black text-white mb-0.5">
                        Paying on{" "}
                        {businessProfile.business_payment_terms === "net_60"
                          ? "Net-60"
                          : "Net-30"}{" "}
                        Credit
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                      >
                        {businessProfile.business_org_name ?? "Your Organization"} ·
                        Invoice due in{" "}
                        {businessProfile.business_payment_terms === "net_60"
                          ? "60"
                          : "30"}{" "}
                        days
                      </div>
                    </div>
                    <div
                      className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full"
                      style={{
                        background: "rgba(163,230,53,0.15)",
                        color: "#a3e635",
                      }}
                    >
                      ✓ Selected
                    </div>
                  </section>
                ) : (
                  <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <h2 className="font-semibold text-slate-900 text-sm">Payment</h2>
                      <span className="ml-auto text-[10px] text-slate-400">Secure &amp; encrypted</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {PAYMENT_OPTIONS.map((opt) => {
                        const selected = paymentMethod === opt.id;
                        const Icon = opt.Icon;
                        const isLocked = opt.status === "locked";
                        const isComingSoon = opt.status === "coming_soon";

                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              if (!isLocked) setPaymentMethod(opt.id);
                            }}
                            disabled={isLocked}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                              isLocked ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              selected ? "bg-slate-900" : isComingSoon ? "bg-amber-50" : "bg-slate-100"
                            }`}>
                              <Icon className={`w-4 h-4 ${selected ? "text-white" : isComingSoon ? "text-amber-600" : "text-slate-500"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900 text-xs">{opt.label}</span>
                                {isComingSoon && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">
                                    <Clock className="w-2.5 h-2.5 mr-0.5" /> Soon
                                  </span>
                                )}
                                {isLocked && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-500">
                                    <Lock className="w-2.5 h-2.5 mr-0.5" /> Locked
                                  </span>
                                )}
                              </div>
                              <div className={`text-[10px] mt-0.5 ${isLocked ? "text-slate-400" : "text-slate-500"}`}>
                                {opt.badge}
                              </div>
                            </div>
                            {/* Radio circle */}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              selected ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                            }`}>
                              {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Info callouts */}
                    <div className="px-4 pb-3">
                      {paymentMethod === "pay_on_delivery" && (
                        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-800 flex items-center gap-2">
                          <Truck className="w-3.5 h-3.5 shrink-0" />
                          Pay cash or POS when the courier arrives.
                        </div>
                      )}
                      {paymentMethod === "stripe_card" && (
                        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-800 flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          Secure card payment powered by Stripe.
                        </div>
                      )}
                      {paymentMethod === "ceb_link" && (
                        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          CEB Link is coming soon. Please use Pay on Delivery.
                        </div>
                      )}
                      {paymentMethod === "telebirr" && (
                        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          Telebirr is coming soon. Please use Pay on Delivery.
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-slate-500" /> Order Summary
                    </h2>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2.5">
                      <Truck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold text-blue-900 text-xs">
                          {isBusinessOrder
                            ? "Office Delivery · 1–3 Business Days"
                            : "Express Delivery"}
                        </div>
                        <div className="text-blue-700 text-xs mt-0.5">
                          {isBusinessOrder ? (
                            "Delivered to your registered office address"
                          ) : (
                            <>
                              <span className="font-bold">24 hours</span> • Free
                              shipping
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-slate-600 text-xs">
                        <span>Subtotal ({displayedItemCount} items)</span>
                        <span className="font-medium text-slate-900">
                          {money(subtotalCents)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 text-xs">
                        <span>Shipping</span>
                        <span className="font-medium text-emerald-600">Free</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 text-xs">
                        <span>Tax</span>
                        <span className="font-medium text-slate-900">
                          {money(taxCents)}
                        </span>
                      </div>
                      <div className="h-px bg-slate-200 my-2" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900">
                          Total
                        </span>
                        <span className="text-xl font-bold text-slate-900">
                          {money(totalCents)}
                        </span>
                      </div>
                      {isBusinessOrder && (
                        <div className="text-[11px] text-slate-500 text-right">
                          Invoice due in{" "}
                          {businessProfile.business_payment_terms === "net_60"
                            ? "60"
                            : "30"}{" "}
                          days
                        </div>
                      )}
                    </div>

                    {!isPaymentMethodActive && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span className="text-amber-700">
                          Please select &quot;Pay on Delivery&quot; to complete your
                          order.
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={
                        placingOrder ||
                        !hasAnyItems ||
                        !isShippingValid() ||
                        !isPaymentMethodActive
                      }
                      onClick={handlePlaceOrder}
                      className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm text-sm mt-4"
                    >
                      {placingOrder ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Processing…
                        </>
                      ) : !isPaymentMethodActive ? (
                        <>
                          Select Pay on Delivery <Lock className="w-4 h-4" />
                        </>
                      ) : isBusinessOrder ? (
                        <>
                          Place Order on Credit{" "}
                          <ArrowLeft className="w-4 h-4 rotate-180" />
                        </>
                      ) : (
                        <>
                          Place Order <ArrowLeft className="w-4 h-4 rotate-180" />
                        </>
                      )}
                    </button>

                    {orderError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                        <span className="text-rose-700">{orderError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100">
                      <div className="text-center p-2">
                        <ShieldCheck className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                        <div className="text-[10px] text-slate-500 font-medium">
                          Secure
                        </div>
                      </div>
                      <div className="text-center p-2">
                        <Truck className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                        <div className="text-[10px] text-slate-500 font-medium">
                          {isBusinessOrder ? "1–3 Days" : "24h"}
                        </div>
                      </div>
                      <div className="text-center p-2">
                        <Package className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                        <div className="text-[10px] text-slate-500 font-medium">
                          Tracked
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="text-center">
                  <p className="text-[11px] text-slate-500">
                    Need help?{" "}
                    <button className="text-blue-600 hover:text-blue-700 font-medium">
                      Contact support
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
