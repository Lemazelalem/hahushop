// app/components/CartContent.tsx
"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMiniCart } from "@/components/MiniCartProvider";
import { ShoppingCart, Trash2, Plus, Minus, ArrowLeft } from "lucide-react";

function money(cents?: number | null) {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${(n / 100).toFixed(2)}`;
}

// We keep this resilient because cart item shape may vary
function getLineTotalCents(it: any) {
  const line = Number(it?.line_total_cents);
  if (Number.isFinite(line) && line >= 0) return line;

  const price = Number(it?.final_price_cents ?? it?.price_cents ?? it?.unit_price_cents ?? 0);
  const qty = Number(it?.qty ?? it?.quantity ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return 0;
  return Math.max(0, Math.round(price * qty));
}

function getQty(it: any) {
  const q = Number(it?.qty ?? it?.quantity ?? 0);
  return Number.isFinite(q) ? q : 0;
}

export default function CartContent() {
  const router = useRouter();
  const { cart, itemCount, isLoaded, addItem, removeItem, setQty, clearCart } = useMiniCart();

  const totals = useMemo(() => {
    const subtotal = (cart as any[]).reduce((acc, it) => acc + getLineTotalCents(it), 0);
    // keep simple for now (you can plug tax/shipping later)
    const tax = 0;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [cart]);

  if (!isLoaded) {
    return (
      <div className="glass glass-ring rounded-[28px] p-6">
        <div className="text-sm text-slate-700">Loading cart…</div>
      </div>
    );
  }

  if (!cart.length) {
    return (
      <div className="glass glass-ring rounded-[28px] p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-white/70 border border-white/80 flex items-center justify-center">
          <ShoppingCart className="w-6 h-6 text-slate-700" />
        </div>
        <div className="mt-4 text-lg font-bold text-slate-900">Your cart is empty</div>
        <div className="mt-1 text-sm text-slate-700">Add items from the shop to see them here.</div>

        <button
          onClick={() => router.push("/shop")}
          className="mt-5 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Go to Shop →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass glass-ring rounded-[28px] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              Checkout
            </div>
            <div className="text-2xl font-bold text-slate-900">Your Cart</div>
            <div className="text-xs text-slate-700 mt-1">
              Items: <span className="font-semibold text-slate-900">{itemCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/shop")}
              className="pill px-4 py-2 text-xs font-bold text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 inline-block mr-1" />
              Back
            </button>
            <button
              onClick={() => clearCart()}
              className="rounded-full bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
            >
              Clear cart
            </button>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="glass glass-ring rounded-[28px] p-4 md:p-6">
        <div className="space-y-3">
          {(cart as any[]).map((it, idx) => {
            const qty = getQty(it);
            const id = String(it?.id ?? it?.product_id ?? idx);
            const kind = (it?.kind ?? "approved") as any; // default safe
            const name = String(it?.name ?? "Item");
            const emoji = String(it?.emoji ?? "🛍️");
            const lineTotal = getLineTotalCents(it);

            return (
              <div key={`${kind}:${id}:${idx}`} className="glass-card glass-ring rounded-[22px] p-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-white/70 border border-white/80 flex items-center justify-center text-2xl">
                    {emoji}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{name}</div>
                    <div className="mt-1 text-xs text-slate-700">
                      Line total: <span className="font-semibold text-slate-900">{money(lineTotal)}</span>
                    </div>
                  </div>

                  {/* Qty controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => addItem(kind, id, -1)}
                      className="h-9 w-9 rounded-xl bg-white/70 border border-white/80 hover:bg-white flex items-center justify-center"
                      disabled={qty <= 1}
                      title="Decrease"
                    >
                      <Minus className="w-4 h-4 text-slate-800" />
                    </button>

                    <input
                      value={qty}
                      onChange={(e) => setQty(kind, id, Number(e.target.value))}
                      className="w-14 h-9 rounded-xl bg-white/70 border border-white/80 text-center text-sm font-bold text-slate-900"
                      inputMode="numeric"
                    />

                    <button
                      onClick={() => addItem(kind, id, 1)}
                      className="h-9 w-9 rounded-xl bg-white/70 border border-white/80 hover:bg-white flex items-center justify-center"
                      title="Increase"
                    >
                      <Plus className="w-4 h-4 text-slate-800" />
                    </button>

                    <button
                      onClick={() => removeItem(kind, id)}
                      className="h-9 w-9 rounded-xl bg-rose-600 hover:bg-rose-700 flex items-center justify-center"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="mt-5 rounded-2xl bg-white/70 border border-white/80 p-4">
          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-900">{money(totals.subtotal)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-slate-700">
            <span>Tax</span>
            <span className="font-semibold text-slate-900">{money(totals.tax)}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">Total</span>
            <span className="text-lg font-black text-slate-900">{money(totals.total)}</span>
          </div>

          <button
            onClick={() => alert("Next step: connect orders/payments.")}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-lime-400 to-sky-400 px-4 py-3 text-sm font-black text-slate-900 shadow-lg shadow-lime-300/25 hover:brightness-105 active:scale-[0.99]"
          >
            Place order →
          </button>
        </div>
      </div>
    </div>
  );
}
