"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import {
  ShoppingCart,
  Star,
  ArrowLeft,
  Sparkles,
  Eye,
  Heart,
  CalendarDays,
} from "lucide-react";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  final_price_cents: number | null;
  price_cents: number | null;
  rating_avg: number;
  rating_count: number;
  category_name: string | null;
  created_at: string;
  days_ago: number;
};

function money(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return "-";
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

function DaysAgoBadge({ days }: { days: number }) {
  if (days === 0) return (
    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-lime-100 text-lime-700 border border-lime-200">
      Today
    </span>
  );
  if (days <= 3) return (
    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
      {days}d ago
    </span>
  );
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
      {days}d ago
    </span>
  );
}

const FILTERS = ["All", "This Week", "This Month"] as const;
type FilterLabel = (typeof FILTERS)[number];

export default function NewArrivalsPage() {
  const router = useRouter();
  const { addItem, cart } = useMiniCart();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<FilterLabel>("All");

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

        // Last 90 days
        const since = new Date();
        since.setDate(since.getDate() - 90);

        const { data, error } = await supabase
          .from("products")
          .select(`
            id, name, description, emoji, image_url,
            final_price_cents, price_cents,
            rating_avg, rating_count, created_at,
            categories(name)
          `)
          .eq("status", "approved")
          .eq("is_active", true)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(60);

        if (!alive) return;
        if (error) { setError(error.message); return; }

        const now = Date.now();
        const rows = (data ?? []).map((r: any) => {
          const createdAt = new Date(r.created_at).getTime();
          const daysAgo = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
          return {
            id: r.id,
            name: r.name,
            description: r.description ?? null,
            emoji: r.emoji ?? null,
            image_url: r.image_url ?? null,
            final_price_cents: r.final_price_cents ?? null,
            price_cents: r.price_cents ?? null,
            rating_avg: Number(r.rating_avg ?? 0),
            rating_count: Number(r.rating_count ?? 0),
            category_name: r.categories?.name ?? null,
            created_at: r.created_at,
            days_ago: daysAgo,
          };
        });

        setProducts(rows);
      } catch (err: any) {
        if (!alive) return;
        setError(err.message ?? "Failed to load new arrivals.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (activeFilter === "This Week") return products.filter((p) => p.days_ago <= 7);
    if (activeFilter === "This Month") return products.filter((p) => p.days_ago <= 30);
    return products;
  }, [products, activeFilter]);

  function toggleWishlist(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setWishlist((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("wishlist", JSON.stringify([...next]));
      return next;
    });
  }

  const thisWeekCount = useMemo(() => products.filter((p) => p.days_ago <= 7).length, [products]);

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Hero banner */}
      <div
        className="relative overflow-hidden py-10 px-6"
        style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#0f1f35 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 75% 50%, rgba(163,230,53,0.1) 0%, transparent 60%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto">
          <button
            onClick={() => router.push("/shop")}
            className="flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Shop
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#a3e635,#22d3ee)" }}
            >
              <Sparkles className="w-5 h-5 text-slate-900" />
            </div>
            {thisWeekCount > 0 && (
              <div
                className="text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full"
                style={{
                  background: "rgba(163,230,53,0.15)",
                  border: "1px solid rgba(163,230,53,0.3)",
                  color: "#a3e635",
                }}
              >
                {thisWeekCount} added this week
              </div>
            )}
          </div>

          <h1
            className="text-4xl md:text-5xl font-black text-white mb-3"
            style={{ letterSpacing: "-0.03em" }}
          >
            New Arrivals
          </h1>
          <p style={{ color: "rgba(255,255,255,0.5)" }} className="text-base">
            The latest products added to HahuShop — fresh stock, first look.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Filter chips */}
        {!loading && products.length > 0 && (
          <div className="flex items-center gap-2 mb-8">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                  activeFilter === f
                    ? "bg-slate-900 text-white border-slate-900 shadow-md"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {f}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-400 font-medium">
              {filtered.length} products
            </span>
          </div>
        )}

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
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">✨</div>
            <h2 className="text-xl font-black text-slate-900 mb-2">
              {activeFilter === "All" ? "No new arrivals yet" : `Nothing new ${activeFilter.toLowerCase()}`}
            </h2>
            <p className="text-slate-500 text-sm mb-6">
              {activeFilter === "All"
                ? "Products will appear here as they're added."
                : "Try a broader time range."}
            </p>
            {activeFilter !== "All" ? (
              <button
                onClick={() => setActiveFilter("All")}
                className="px-6 py-3 bg-slate-900 text-white font-bold rounded-full hover:bg-slate-700 transition-all"
              >
                Show All Arrivals
              </button>
            ) : (
              <button
                onClick={() => router.push("/shop")}
                className="px-6 py-3 bg-slate-900 text-white font-bold rounded-full hover:bg-slate-700 transition-all"
              >
                Browse All Products
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((p) => {
              const qty = cartQty[p.id] ?? 0;
              const isWishlisted = wishlist.has(p.id);
              const price = p.final_price_cents ?? p.price_cents;
              const originalPrice = p.price_cents;
              const hasDiscount =
                p.final_price_cents &&
                originalPrice &&
                p.final_price_cents < originalPrice;
              const discountPct = hasDiscount
                ? Math.round((1 - p.final_price_cents! / originalPrice!) * 100)
                : 0;

              return (
                <article
                  key={p.id}
                  className="group bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl hover:border-lime-200 transition-all duration-300 flex flex-col"
                >
                  {/* Image */}
                  <div
                    onClick={() => router.push(`/products/${p.id}`)}
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

                    {/* NEW badge */}
                    <div
                      className="absolute top-3 left-3 text-[10px] font-black px-2.5 py-1.5 rounded-full"
                      style={{
                        background: "linear-gradient(90deg,#a3e635,#22d3ee)",
                        color: "#0f172a",
                      }}
                    >
                      NEW
                    </div>

                    {/* Discount badge if any */}
                    {discountPct > 0 && (
                      <div className="absolute top-3 right-10 bg-rose-500 text-white text-[10px] font-bold px-2 py-1.5 rounded-full">
                        {discountPct}% OFF
                      </div>
                    )}

                    {/* Wishlist */}
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

                    {/* Cart qty */}
                    {qty > 0 && (
                      <div className="absolute bottom-3 left-3 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1 shadow-lg">
                        <ShoppingCart className="w-3 h-3" />
                        {qty}
                      </div>
                    )}

                    {/* Quick view */}
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/products/${p.id}`); }}
                      className="absolute bottom-3 right-3 p-2.5 bg-white/90 text-slate-700 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-1">
                      {p.category_name && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {p.category_name}
                        </span>
                      )}
                      <DaysAgoBadge days={p.days_ago} />
                    </div>
                    <h3
                      onClick={() => router.push(`/products/${p.id}`)}
                      className="text-sm font-bold text-slate-900 line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors mb-2 flex-1"
                    >
                      {p.name}
                    </h3>
                    <StarRating rating={p.rating_avg} count={p.rating_count} />

                    {/* Price row */}
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        <div className="text-base font-black text-slate-900">{money(price)}</div>
                        {hasDiscount && (
                          <div className="text-xs text-slate-400 line-through">
                            {money(originalPrice)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => addItem("approved", p.id, 1)}
                        className="text-white text-xs font-bold px-3 py-2.5 rounded-xl shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                        style={{ background: "linear-gradient(90deg,#a3e635,#22d3ee)", color: "#0f172a" }}
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