// app/categories/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProductStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

type ProductRow = {
  id: string;
  status: ProductStatus;
  category: string | null;
  categories?: { name: string | null; slug?: string | null } | null;
};

type CategoryTile = {
  key: string;
  label: string;
  description: string;
  emoji: string;
  gradient: string;
  shadowColor: string;
};

const CATEGORY_TILES: CategoryTile[] = [
  {
    key: "all",
    label: "All Products",
    description: "Browse everything available in the marketplace",
    emoji: "🛒",
    gradient: "from-slate-700 via-slate-800 to-slate-900",
    shadowColor: "shadow-slate-500/30",
  },
  {
    key: "shoes",
    label: "Shoes",
    description: "Sneakers, trainers, and everyday favorites",
    emoji: "👟",
    gradient: "from-orange-400 via-red-500 to-pink-500",
    shadowColor: "shadow-orange-500/30",
  },
  {
    key: "wearables",
    label: "Wearables",
    description: "Smart watches, bands, and accessories",
    emoji: "⌚",
    gradient: "from-blue-400 via-indigo-500 to-purple-500",
    shadowColor: "shadow-blue-500/30",
  },
  {
    key: "audio",
    label: "Audio",
    description: "Headphones, earbuds, and speakers",
    emoji: "🎧",
    gradient: "from-emerald-400 via-teal-500 to-cyan-500",
    shadowColor: "shadow-emerald-500/30",
  },
  {
    key: "bags",
    label: "Bags",
    description: "Backpacks, totes, and daily carry",
    emoji: "🎒",
    gradient: "from-amber-400 via-orange-500 to-red-500",
    shadowColor: "shadow-amber-500/30",
  },
  {
    key: "accessories",
    label: "Accessories",
    description: "Little extras that complete the look",
    emoji: "✨",
    gradient: "from-violet-400 via-purple-500 to-fuchsia-500",
    shadowColor: "shadow-violet-500/30",
  },
];

export default function CategoriesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("products")
          .select(`id, status, category, categories(name, slug)`)
          .eq("status", "approved");

        if (error) {
          setPageError(error.message || "Could not load approved products.");
          return;
        }

        setProducts((data ?? []).map((row: any) => ({
          id: row.id,
          status: row.status,
          category: row.categories?.name ?? row.category ?? row.categories?.slug ?? null,
        })));
      } catch (err: any) {
        setPageError("Unexpected error while loading categories.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const countsByKey = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      const raw = (p.category || "").toLowerCase().trim();
      let key = raw;
      if (!key) continue;
      if (key.includes("shoe")) key = "shoes";
      if (key.includes("wearable")) key = "wearables";
      if (key.includes("audio") || key.includes("music")) key = "audio";
      if (key.includes("bag")) key = "bags";
      if (key.includes("accessor")) key = "accessories";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    counts["all"] = products.length;
    return counts;
  }, [products]);

  const totalApproved = countsByKey["all"] ?? 0;

  function handleView(tile: CategoryTile) {
    if (tile.key === "all") {
      router.push("/shop");
      return;
    }
    router.push(`/shop?category=${encodeURIComponent(tile.key)}`);
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto max-w-7xl space-y-8">
        {/* Modern Header */}
        <section className="text-center md:text-left md:flex md:items-end md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-lg shadow-lg shadow-emerald-500/30">
                🏷️
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 bg-emerald-100/80 px-3 py-1 rounded-full">
                Browse
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-2">
              Categories
            </h1>
            <p className="text-base text-slate-600 max-w-lg">
              Explore {totalApproved} approved products across {CATEGORY_TILES.length} curated categories
            </p>
          </div>

          {!loading && (
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <div className="text-3xl font-black text-slate-900">{totalApproved}</div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Products</div>
              </div>
              <div className="w-px h-12 bg-slate-200" />
              <div className="text-right">
                <div className="text-3xl font-black text-emerald-600">{CATEGORY_TILES.length}</div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Categories</div>
              </div>
            </div>
          )}
        </section>

        {/* Error */}
        {pageError && (
          <div className="rounded-2xl p-4 bg-red-50 border border-red-200 text-sm text-red-700 font-medium flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {pageError}
          </div>
        )}

        {/* Categories Grid - Modern Cards */}
        <section>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-3xl bg-slate-200/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORY_TILES.map((tile, index) => {
                const count = countsByKey[tile.key] ?? 0;
                const isHovered = hoveredKey === tile.key;
                const isAll = tile.key === "all";

                return (
                  <button
                    key={tile.key}
                    type="button"
                    onClick={() => handleView(tile)}
                    onMouseEnter={() => setHoveredKey(tile.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    className={[
                      "group relative overflow-hidden rounded-3xl text-left transition-all duration-300",
                      "hover:scale-[1.02] hover:shadow-2xl",
                      tile.shadowColor,
                      isAll ? "ring-2 ring-slate-900/10" : "",
                    ].join(" ")}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Background Gradient */}
                    <div className={[
                      "absolute inset-0 bg-gradient-to-br transition-opacity duration-300",
                      tile.gradient,
                      isHovered ? "opacity-100" : "opacity-95",
                    ].join(" ")} />

                    {/* Content */}
                    <div className="relative p-6 h-full flex flex-col justify-between min-h-[160px]">
                      {/* Top Row */}
                      <div className="flex items-start justify-between">
                        <div className={[
                          "w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg transition-transform duration-300",
                          isHovered ? "scale-110 rotate-3" : "",
                          isAll ? "bg-white/20 backdrop-blur-sm" : "bg-white/90",
                        ].join(" ")}>
                          <span>{tile.emoji}</span>
                        </div>
                        
                        <div className="flex flex-col items-end">
                          <span className="text-4xl font-black text-white/90 drop-shadow-sm">
                            {count}
                          </span>
                          <span className="text-xs font-bold text-white/70 uppercase tracking-wide">
                            items
                          </span>
                        </div>
                      </div>

                      {/* Bottom Row */}
                      <div>
                        <h3 className="text-xl font-black text-white mb-1 drop-shadow-sm">
                          {tile.label}
                        </h3>
                        <p className="text-sm text-white/80 font-medium leading-snug mb-4">
                          {tile.description}
                        </p>
                        
                        <div className={[
                          "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all duration-300",
                          isHovered 
                            ? "bg-white text-slate-900 shadow-lg translate-x-1" 
                            : "bg-white/20 text-white backdrop-blur-sm",
                        ].join(" ")}>
                          <span>Explore</span>
                          <svg 
                            className={["w-4 h-4 transition-transform duration-300", isHovered ? "translate-x-1" : ""].join(" ")} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </div>
                      </div>

                      {/* Decorative Elements */}
                      <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                      <div className="absolute -top-8 -left-8 w-24 h-24 bg-white/5 rounded-full blur-xl" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Bottom CTA */}
        {!loading && (
          <section className="text-center py-8">
            <button
              onClick={() => router.push("/shop")}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-slate-900 text-white font-bold text-lg shadow-xl shadow-slate-900/20 hover:shadow-2xl hover:shadow-slate-900/30 hover:scale-105 active:scale-95 transition-all duration-300"
            >
              <span>View All Products</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </section>
        )}
      </div>
    </main>
  );
}