"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import {
  ShoppingCart,
  Star,
  Eye,
  Heart,
  Tag,
} from "lucide-react";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  final_price_cents: number;
  price_cents: number;
  rating_avg: number;
  rating_count: number;
  category_name: string | null;
  discount_pct: number;
  savings_cents: number;
};

function money(cents: number): string {
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < full
                ? "fill-amber-400 text-amber-400"
                : i === full && half
                ? "fill-amber-400/50 text-amber-400"
                : "fill-slate-100 text-slate-200"
            }`}
          />
        ))}
      </div>
      <span className="text-[11px] text-slate-500 font-medium">
        {count > 0 ? `(${count})` : "No reviews"}
      </span>
    </div>
  );
}

export default function DealsPage() {
  const router = useRouter();
  const { addItem, cart } = useMiniCart();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());

  const cartQty = useMemo(() => {
    const m: Record<string, number> = {};
    cart.forEach((item) => {
      if (item.kind === "approved" || item.kind === "approved_public")
        m[item.id] = (m[item.id] || 0) + item.quantity;
    });
    return m;
  }, [cart]);

  useEffect(() => {
    const saved = localStorage.getItem("wishlist");
    if (saved) setWishlist(new Set(JSON.parse(saved)));
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("products")
          .select(`
            id, name, description, emoji, image_url,
            final_price_cents, price_cents,
            rating_avg, rating_count,
            categories(name)
          `)
          .eq("status", "approved")
          .eq("is_active", true)
          .not("price_cents", "is", null)
          .not("final_price_cents", "is", null)
          .gt("price_cents", 0)
          .gt("final_price_cents", 0);

        if (!alive) return;
        if (error) { setError(error.message); return; }

        const rows = (data ?? [])
          .map((r: any) => {
            const orig = r.price_cents as number;
            const final = r.final_price_cents as number;
            const discount = Math.round((1 - final / orig) * 100);
            return {
              id: r.id,
              name: r.name,
              description: r.description ?? null,
              emoji: r.emoji ?? null,
              image_url: r.image_url ?? null,
              final_price_cents: final,
              price_cents: orig,
              rating_avg: Number(r.rating_avg ?? 0),
              rating_count: Number(r.rating_count ?? 0),
              category_name: r.categories?.name ?? null,
              discount_pct: discount,
              savings_cents: orig - final,
            };
          })
          .filter((p) => p.discount_pct > 0)
          .sort((a, b) => b.discount_pct - a.discount_pct);

        setProducts(rows);
      } catch (err: any) {
        if (!alive) return;
        setError(err.message ?? "Failed to load deals.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  function toggleWishlist(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setWishlist((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("wishlist", JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Simple page title */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-rose-500 flex items-center justify-center flex-shrink-0">
            <Tag className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900" style={{ letterSpacing: "-0.02em" }}>
              Today&apos;s Deals
            </h1>
            {!loading && (
              <p className="text-xs text-slate-400 font-medium">
                {products.length} deals available — sorted by biggest discount
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm font-semibold">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-3xl p-4 animate-pulse border border-slate-100">
                <div className="aspect-square bg-slate-200 rounded-2xl mb-4" />
                <div className="h-4 w-3/4 bg-slate-200 rounded-lg mb-2" />
                <div className="h-3 w-1/2 bg-slate-200 rounded-lg" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏷️</div>
            <h2 className="text-xl font-black text-slate-900 mb-2">No deals right now</h2>
            <p className="text-slate-500 text-sm mb-6">Check back soon — deals are updated daily.</p>
            <button
              onClick={() => router.push("/shop")}
              className="px-6 py-3 bg-slate-900 text-white font-bold rounded-full hover:bg-slate-700 transition-all"
            >
              Browse All Products
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map((p) => {
              const qty = cartQty[p.id] ?? 0;
              const isWishlisted = wishlist.has(p.id);
              return (
                <article
                  key={p.id}
                  className="group bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl hover:border-rose-200 transition-all duration-300 flex flex-col"
                >
                  <div
                    onClick={() => router.push(`/shop/${p.id}`)}
                    className="relative aspect-square bg-slate-50 cursor-pointer overflow-hidden"
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl group-hover:scale-105 transition-transform">
                        {p.emoji ?? "🛍️"}
                      </div>
                    )}

                    <div className="absolute top-3 left-3 bg-rose-500 text-white text-xs font-black px-2.5 py-1.5 rounded-full shadow-lg">
                      {p.discount_pct}% OFF
                    </div>

                    <button
                      onClick={(e) => toggleWishlist(p.id, e)}
                      className={`absolute top-3 right-3 p-2.5 rounded-full transition-all ${
                        isWishlisted
                          ? "bg-rose-500 text-white shadow-lg"
                          : "bg-white/90 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isWishlisted ? "fill-current" : ""}`} />
                    </button>

                    {qty > 0 && (
                      <div className="absolute bottom-3 left-3 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1 shadow-lg">
                        <ShoppingCart className="w-3 h-3" />
                        {qty}
                      </div>
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/shop/${p.id}`); }}
                      className="absolute bottom-3 right-3 p-2.5 bg-white/90 text-slate-700 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 flex flex-col flex-1">
                    {p.category_name && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {p.category_name}
                      </span>
                    )}
                    <h3
                      onClick={() => router.push(`/shop/${p.id}`)}
                      className="text-sm font-bold text-slate-900 line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors mb-2 flex-1"
                    >
                      {p.name}
                    </h3>
                    <StarRating rating={p.rating_avg} count={p.rating_count} />

                    <div className="mt-2 mb-3 px-2.5 py-1.5 bg-rose-50 border border-rose-100 rounded-xl">
                      <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                        You save {money(p.savings_cents)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-black text-slate-900">
                          {money(p.final_price_cents)}
                        </div>
                        <div className="text-xs text-slate-400 line-through">
                          {money(p.price_cents)}
                        </div>
                      </div>
                      <button
                        onClick={() => addItem("approved", p.id, 1)}
                        className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-3 py-2.5 rounded-xl shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
