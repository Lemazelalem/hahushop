// app/products/[id]/page.tsx
"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import type { ItemMeta } from "@/components/MiniCartProvider";
import { flyToCart } from "@/lib/flyToCart";
import {
  ShoppingCart, Check, ArrowRight, Star, Package,
  ChevronRight, Minus, Plus, RotateCcw, Heart,
  Truck, RotateCcw as Return, Flame, ArrowLeft,
  ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";

// ─── Fonts & Palette ─────────────────────────────────────────────────────────
const F       = "'DM Sans', 'Inter', system-ui, sans-serif";
const BLACK   = "#111827";
const ACCENT  = "#FF0255";   // HahuShop pink — matches mobile
const RED     = "#c0392b";
const MUTED   = "#6b7280";
const BORDER  = "#e5e7eb";
const BG      = "#f9fafb";
const TEAL    = "#0891b2";

// ─── Types ────────────────────────────────────────────────────────────────────
type ProductStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

type ColorVariant = {
  id: string; name: string; hex: string;
  imageUrl: string; extraImageUrls: string[];
};

type SizeVariant = {
  id: string; label: string; stock: number; priceAdjustCents: number;
};

type ProductRow = {
  id: string; seller_id: string | null; category_id: string | null;
  name: string; description: string | null; emoji: string | null;
  status: ProductStatus; image_url: string | null;
  extra_image_urls: string[] | null; price_cents: number | null;
  final_price_cents: number | null; public_employee_price_cents: number | null;
  stock_quantity: number | null; rating_avg: number; rating_count: number;
  created_at: string; category_name: string | null;
  color_variants: ColorVariant[] | null; size_variants: SizeVariant[] | null;
};

type RatingRow = { id: string; product_id: string; user_id: string; rating: number; };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function money(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "ETB 0.00";
  return `ETB ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function moneyVal(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return "0.00";
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function moneyNum(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return "0";
  return (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function clampRating(n: number) { return Math.min(5, Math.max(1, Math.round(n))); }
function normCat(name: string | null | undefined) { return (name || "").trim() || "Uncategorized"; }
function getDeliveryDate(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── StarDisplay ──────────────────────────────────────────────────────────────
function StarDisplay({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const full = Math.floor(value), half = value - full >= 0.5;
  const sz = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`${sz} ${
          i < full ? "fill-amber-400 text-amber-400"
          : i === full && half ? "fill-amber-400/50 text-amber-400"
          : "fill-slate-200 text-slate-200"}`} />
      ))}
    </div>
  );
}

// ─── StarInput ────────────────────────────────────────────────────────────────
function StarInput({ value, onChange, disabled }: { value: number; onChange: (r: number) => void; disabled?: boolean; }) {
  const [hover, setHover] = useState<number | null>(null);
  const cur = hover ?? value;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const v = i + 1, filled = cur >= v;
        return (
          <button key={v} type="button" disabled={disabled}
            onMouseEnter={() => !disabled && setHover(v)}
            onMouseLeave={() => setHover(null)}
            onClick={() => !disabled && onChange(v)}
            className={`h-8 w-8 rounded-full flex items-center justify-center transition-all
              ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:scale-110"}
              ${filled ? "bg-amber-400 text-slate-900" : "bg-slate-100 text-slate-400"}`}>
            <Star className={`w-4 h-4 ${filled ? "fill-current" : ""}`} />
          </button>
        );
      })}
    </div>
  );
}

// ─── MiniCard ─────────────────────────────────────────────────────────────────
function MiniCard({ product, onClick, isPE }: { product: ProductRow; onClick: () => void; isPE?: boolean }) {
  const src = product.image_url || product.extra_image_urls?.[0] || null;
  const price = isPE && product.public_employee_price_cents
    ? product.public_employee_price_cents
    : (product.final_price_cents ?? product.price_cents ?? 0);
  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl border overflow-hidden min-w-[150px] max-w-[150px] hover:shadow-md transition-all cursor-pointer flex-shrink-0"
      style={{ borderColor: BORDER }}>
      <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
        {src ? <img src={src} alt={product.name} className="w-full h-full object-cover" />
              : <span className="text-3xl">{product.emoji || "🛍️"}</span>}
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 leading-snug mb-1.5 text-xs" style={{ fontFamily: F, color: BLACK }}>{product.name}</p>
        {product.rating_count > 0 && (
          <div className="flex items-center gap-1 mb-1">
            <StarDisplay value={product.rating_avg} />
            <span className="text-[10px]" style={{ color: MUTED }}>({product.rating_count})</span>
          </div>
        )}
        <div className="flex items-baseline gap-1">
          <span className="text-[10px]" style={{ color: ACCENT }}>ETB</span>
          <span className="text-sm font-bold" style={{ color: BLACK }}>{moneyNum(price)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── StockBadge ───────────────────────────────────────────────────────────────
function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0)  return <span className="text-xs font-semibold" style={{ color: RED }}>Out of stock</span>;
  if (stock <= 5)  return <span className="text-xs" style={{ color: RED }}>Only {stock} left</span>;
  return <span className="text-xs" style={{ color: MUTED }}>{stock} in stock</span>;
}

// ─── Countdown hook ───────────────────────────────────────────────────────────
function useCountdown(initialSeconds: number) {
  const [t, setT] = useState(initialSeconds);
  useEffect(() => {
    const id = setInterval(() => setT(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ─── Qty Selector ─────────────────────────────────────────────────────────────
function QtySelector({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number; }) {
  return (
    <div className="flex items-center overflow-hidden bg-white" style={{ border: `1.5px solid ${BORDER}`, borderRadius: 10 }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="w-9 h-9 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        style={{ color: BLACK }}>
        <Minus className="w-3 h-3" />
      </button>
      <span className="w-9 h-9 flex items-center justify-center text-sm font-bold"
        style={{ color: BLACK, borderLeft: `1.5px solid ${BORDER}`, borderRight: `1.5px solid ${BORDER}` }}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="w-9 h-9 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        style={{ color: BLACK }}>
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── VariantPill ──────────────────────────────────────────────────────────────
function VariantPill({ color, size }: { color: ColorVariant | null; size: SizeVariant | null }) {
  if (!color && !size) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      {color && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
          style={{ background: BG, border: `1px solid ${BORDER}`, color: BLACK }}>
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color.hex, border: `1px solid ${BORDER}` }} />
          {color.name}
        </span>
      )}
      {size && (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs"
          style={{ background: BG, border: `1px solid ${BORDER}`, color: BLACK }}>
          Size {size.label}
        </span>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//   MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { addItem, cart } = useMiniCart();
  const countdown = useCountdown(2 * 3600 + 58 * 60 + 34);

  const [loading, setLoading]               = useState(true);
  const [pageError, setPageError]           = useState<string | null>(null);
  const [product, setProduct]               = useState<ProductRow | null>(null);
  const [userId, setUserId]                 = useState<string | null>(null);
  const [isPE, setIsPE]                     = useState(false);

  const [myRatingRow, setMyRatingRow]   = useState<RatingRow | null>(null);
  const [myRating, setMyRating]         = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingMsg, setRatingMsg]       = useState<string | null>(null);

  const [imgIdx, setImgIdx]           = useState(0);
  const [moreFromSeller, setMoreFromSeller] = useState<ProductRow[]>([]);
  const [similar, setSimilar]         = useState<ProductRow[]>([]);
  const [addedToCart, setAddedToCart] = useState(false);
  const [wishlisted, setWishlisted]   = useState(false);

  const [selColorId, setSelColorId] = useState<string | null>(null);
  const [selSizeId, setSelSizeId]   = useState<string | null>(null);
  const [quantity, setQuantity]     = useState(1);
  const [variantErr, setVariantErr] = useState<string | null>(null);

  // cart quantity for this product
  const cartQty = useMemo(() => {
    if (!product) return 0;
    return (cart as any[])
      .filter(i => String(i.id ?? i.product_id ?? "") === String(product.id) &&
        (i.kind === "approved" || i.kind === "approved_public"))
      .reduce((s, i) => s + Number(i.qty ?? i.quantity ?? 0), 0);
  }, [cart, product]);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = params?.id;
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setPageError(null);
      try {
        const authPromise = supabase.auth.getUser();
        const productPromise = supabase.from("products")
          .select(`id, seller_id, category_id, name, description, emoji, status,
            image_url, extra_image_urls, price_cents, final_price_cents,
            public_employee_price_cents, stock_quantity, rating_avg, rating_count,
            created_at, color_variants, size_variants, categories(name)`)
          .eq("id", id).eq("status", "approved").eq("is_active", true).maybeSingle();

        const [{ data: ud }, { data: raw, error: pe2 }] = await Promise.all([
          authPromise,
          productPromise,
        ]);
        const uid = ud?.user?.id ?? null;
        if (cancelled) return;
        setUserId(uid);

        if (pe2) { setPageError(pe2.message); setLoading(false); return; }
        if (!raw)  { setPageError("Product not found."); setLoading(false); return; }

        const p = raw as any;
        const mapped: ProductRow = {
          id: p.id, seller_id: p.seller_id, category_id: p.category_id,
          name: p.name, description: p.description, emoji: p.emoji, status: p.status,
          image_url: p.image_url, extra_image_urls: p.extra_image_urls ?? [],
          price_cents: p.price_cents, final_price_cents: p.final_price_cents,
          public_employee_price_cents: p.public_employee_price_cents,
          stock_quantity: p.stock_quantity ?? null,
          rating_avg: Number(p.rating_avg ?? 0), rating_count: Number(p.rating_count ?? 0),
          created_at: p.created_at, category_name: p.categories?.name ?? null,
          color_variants: p.color_variants ?? null, size_variants: p.size_variants ?? null,
        };
        if (cancelled) return;
        setProduct(mapped);
        setImgIdx(0); setSelColorId(null); setSelSizeId(null); setQuantity(1);
        setMoreFromSeller([]);
        setSimilar([]);
        setMyRatingRow(null);
        setMyRating(0);
        setIsPE(false);
        setLoading(false);

        void (async () => {
          try {
            if (uid) {
              const [{ data: pe }, { data: rr }] = await Promise.all([
                supabase.from("public_employee_documents")
                  .select("status").eq("user_id", uid).eq("status", "approved").maybeSingle(),
                supabase.from("product_ratings")
                  .select("id, product_id, user_id, rating")
                  .eq("product_id", mapped.id).eq("user_id", uid).maybeSingle(),
              ]);

              if (!cancelled) {
                setIsPE(Boolean(pe));
                if (rr) {
                  setMyRatingRow(rr as RatingRow);
                  setMyRating((rr as RatingRow).rating);
                }
              }
            }

            const norm = (sp: any): ProductRow => ({
              ...sp, stock_quantity: sp.stock_quantity ?? null,
              rating_avg: Number(sp.rating_avg ?? 0), rating_count: Number(sp.rating_count ?? 0),
              category_name: sp.categories?.name ?? null,
              color_variants: sp.color_variants ?? null, size_variants: sp.size_variants ?? null,
            });

            const relatedTasks = [];

            if (mapped.seller_id) {
              relatedTasks.push(
                supabase.from("products")
                  .select(`id, seller_id, category_id, name, description, emoji, status,
                    image_url, extra_image_urls, price_cents, final_price_cents,
                    public_employee_price_cents, stock_quantity, rating_avg, rating_count,
                    created_at, color_variants, size_variants, categories(name)`)
                  .eq("seller_id", mapped.seller_id).eq("status", "approved").eq("is_active", true)
                  .neq("id", mapped.id).order("created_at", { ascending: false }).limit(8)
                  .then(({ data }) => {
                    if (!cancelled && data) setMoreFromSeller((data as any[]).map(norm));
                  })
              );
            }

            if (mapped.category_id) {
              relatedTasks.push(
                supabase.from("products")
                  .select(`id, seller_id, category_id, name, description, emoji, status,
                    image_url, extra_image_urls, price_cents, final_price_cents,
                    public_employee_price_cents, stock_quantity, rating_avg, rating_count,
                    created_at, color_variants, size_variants, categories(name)`)
                  .eq("category_id", mapped.category_id).eq("status", "approved").eq("is_active", true)
                  .neq("id", mapped.id).order("created_at", { ascending: false }).limit(10)
                  .then(({ data }) => {
                    if (!cancelled && data) setSimilar((data as any[]).map(norm));
                  })
              );
            }

            await Promise.allSettled(relatedTasks);
          } catch {
            // Background product-detail enrichments should not block the main page.
          }
        })();
      } catch (err: any) {
        setPageError(err?.message || "Unexpected error.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selColor = useMemo(() => product?.color_variants?.find(c => c.id === selColorId) ?? null, [product, selColorId]);
  const selSize  = useMemo(() => product?.size_variants?.find(s => s.id === selSizeId) ?? null, [product, selSizeId]);

  const allImages = useMemo(() => {
    if (!product) return [] as string[];
    if (selColor) {
      const list: string[] = [];
      if (selColor.imageUrl) list.push(selColor.imageUrl);
      for (const u of selColor.extraImageUrls ?? []) if (u && !list.includes(u)) list.push(u);
      if (list.length) return list;
    }
    const list: string[] = [];
    if (product.image_url) list.push(product.image_url);
    for (const u of product.extra_image_urls ?? []) if (u && !list.includes(u)) list.push(u);
    return list;
  }, [product, selColor]);

  useEffect(() => { setImgIdx(0); }, [selColorId]);
  const activeImg = allImages[imgIdx] ?? allImages[0] ?? null;

  const basePrice      = product?.final_price_cents ?? product?.price_cents ?? 0;
  const sizeAdj        = selSize?.priceAdjustCents ?? 0;
  const displayPrice   = basePrice + sizeAdj;
  const origPrice      = product?.price_cents && product?.final_price_cents &&
    product.final_price_cents < product.price_cents ? product.price_cents : null;
  const discPct        = origPrice && basePrice ? Math.round((1 - basePrice / origPrice) * 100) : 0;
  const peBase         = product?.public_employee_price_cents ?? null;
  const pePrice        = peBase !== null ? peBase + sizeAdj : null;
  const showPE         = isPE && pePrice !== null && pePrice < displayPrice;
  const effectiveStock = useMemo(() => {
    if (!product) return null;
    return (product.size_variants?.length ?? 0) > 0 ? (selSize?.stock ?? null) : product.stock_quantity;
  }, [product, selSize]);
  const isOOS          = effectiveStock !== null && effectiveStock <= 0;
  const hasColors      = (product?.color_variants?.length ?? 0) > 0;
  const hasSizes       = (product?.size_variants?.length ?? 0) > 0;
  const needsSize      = hasSizes && !selSizeId;
  const needsColor     = hasColors && !selColorId;
  const cantAdd        = needsSize || isOOS;
  const soldCount      = useMemo(() => (product?.rating_count ?? 0) * 12, [product]);
  const save           = origPrice ? origPrice - basePrice : 0;

  function addLabel() {
    if (needsSize) return "Select a Size";
    if (isOOS)    return "Out of Stock";
    return quantity > 1 ? `Add ${quantity} to Cart` : "Add to Cart";
  }

  // ── Rating ────────────────────────────────────────────────────────────────
  async function handleRating(newR: number) {
    if (!product || !userId) { setRatingMsg("Sign in to rate."); return; }
    const rating = clampRating(newR);
    try {
      setRatingSaving(true); setRatingMsg(null);
      if (myRatingRow) {
        const { data, error } = await supabase.from("product_ratings")
          .update({ rating }).eq("id", myRatingRow.id)
          .select("id, product_id, user_id, rating").maybeSingle();
        if (error) { setRatingMsg(error.message); return; }
        if (data) { setMyRatingRow(data as RatingRow); setMyRating((data as RatingRow).rating); }
      } else {
        const { data, error } = await supabase.from("product_ratings")
          .insert({ product_id: product.id, user_id: userId, rating })
          .select("id, product_id, user_id, rating").maybeSingle();
        if (error) { setRatingMsg(error.message); return; }
        if (data) { setMyRatingRow(data as RatingRow); setMyRating((data as RatingRow).rating); }
      }
      const { data: up } = await supabase.from("products")
        .select("rating_avg, rating_count").eq("id", product.id).maybeSingle();
      if (up) setProduct(prev => prev ? {
        ...prev,
        rating_avg:   Number((up as any).rating_avg ?? 0),
        rating_count: Number((up as any).rating_count ?? 0),
      } : null);
      setRatingMsg("Rating saved!");
    } catch (err: any) {
      setRatingMsg(err?.message || "Error saving rating.");
    } finally {
      setRatingSaving(false);
    }
  }

  // ── Add to cart ───────────────────────────────────────────────────────────
  function handleAddToCart(e?: MouseEvent<HTMLButtonElement>): boolean {
    if (!product) return false;
    if (needsSize)  { setVariantErr("Please select a size."); return false; }
    if (needsColor) { setVariantErr("Please select a color."); return false; }
    if (isOOS)      { setVariantErr("This item is out of stock."); return false; }
    setVariantErr(null);
    const usePE   = isPE && product.public_employee_price_cents !== null;
    const kind: "approved" | "approved_public" = usePE ? "approved_public" : "approved";
    const finalP  = usePE && pePrice !== null ? pePrice : displayPrice;
    const meta: ItemMeta | undefined = hasColors || hasSizes || usePE ? {
      colorVariantId: selColorId ?? null, colorName: selColor?.name ?? null,
      sizeVariantId: selSizeId ?? null, sizeLabel: selSize?.label ?? null,
      priceAdjustCents: selSize?.priceAdjustCents ?? 0, finalPriceCents: finalP,
      ...(usePE && { overridePriceCents: finalP }),
    } : undefined;
    addItem(kind, product.id, quantity, meta);
    flyToCart({ sourceEl: e?.currentTarget, imageUrl: activeImg || product.image_url });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
    return true;
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!product && loading) return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-6xl mx-auto animate-pulse space-y-6">
        <div className="h-4 w-48 bg-slate-200 rounded-lg" />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="aspect-square bg-slate-200 rounded-2xl" />
          <div className="space-y-4">
            {[80,60,40,100,50].map((w,i) => <div key={i} className={`h-4 w-${w} bg-slate-200 rounded-lg`} />)}
          </div>
        </div>
      </div>
    </main>
  );

  if (pageError && !product) return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border p-10 text-center max-w-sm" style={{ borderColor: BORDER }}>
        <div className="text-5xl mb-4">😕</div>
        <div className="text-lg font-bold mb-2" style={{ color: BLACK }}>Couldn't load product</div>
        <div className="text-sm mb-6" style={{ color: MUTED }}>{pageError}</div>
        <button onClick={() => router.push("/shop")}
          className="px-5 py-2.5 rounded-xl text-sm text-white font-medium"
          style={{ background: BLACK, fontFamily: F }}>← Back to shop</button>
      </div>
    </main>
  );

  if (!product) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50" style={{ fontFamily: F }}>

      {/* ══════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on lg+)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden flex flex-col min-h-screen bg-white">

        {/* Mobile header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b sticky top-0 z-30"
          style={{ borderColor: BORDER }}>
          <button onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
            style={{ color: BLACK }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold truncate max-w-[200px]" style={{ color: BLACK }}>
            {product.name}
          </span>
          <button onClick={() => setWishlisted(w => !w)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <Heart className={`w-5 h-5 transition-colors ${wishlisted ? "fill-rose-500 text-rose-500" : "text-slate-400"}`} />
          </button>
        </div>

        {/* Mobile image gallery */}
        <div className="relative bg-slate-50 overflow-hidden" style={{ aspectRatio: "1/1" }}>
          {activeImg
            ? <img src={activeImg} alt={product.name} className="w-full h-full object-contain" />
            : <div className="w-full h-full flex items-center justify-center text-8xl">{product.emoji || "🛍️"}</div>}
          {discPct > 0 && (
            <div className="absolute top-3 left-3 text-white text-xs font-black px-2.5 py-1 rounded-md"
              style={{ background: ACCENT }}>-{discPct}%</div>
          )}
          {allImages.length > 1 && (
            <>
              <button onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm"
                style={{ display: imgIdx === 0 ? "none" : "flex" }}>
                <ChevronLeft className="w-4 h-4" style={{ color: BLACK }} />
              </button>
              <button onClick={() => setImgIdx(i => Math.min(allImages.length - 1, i + 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm"
                style={{ display: imgIdx === allImages.length - 1 ? "none" : "flex" }}>
                <ChevronRightIcon className="w-4 h-4" style={{ color: BLACK }} />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {allImages.map((_, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    style={{ width: i === imgIdx ? 20 : 6, height: 6, borderRadius: 999,
                      background: i === imgIdx ? BLACK : "rgba(0,0,0,0.2)", border: "none",
                      padding: 0, cursor: "pointer", transition: "all 0.2s" }} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Mobile thumbnail strip */}
        {allImages.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-2.5 bg-white [scrollbar-width:none]">
            {allImages.map((src, i) => (
              <button key={i} onClick={() => setImgIdx(i)}
                className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all"
                style={{ border: `2px solid ${i === imgIdx ? BLACK : BORDER}` }}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Mobile content */}
        <div className="px-4 pt-3 pb-40">

          {/* ── Price row ── */}
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            {discPct > 0 && (
              <span className="font-black" style={{ fontSize: 15, color: ACCENT }}>-{discPct}%</span>
            )}
            <span className="font-medium" style={{ fontSize: 13, color: MUTED }}>ETB</span>
            <span className="font-black tracking-tight" style={{ fontSize: 20, color: BLACK }}>
              {moneyNum(displayPrice)}
            </span>
            {origPrice && (
              <span className="text-xs line-through" style={{ color: "#bbb" }}>ETB {moneyNum(origPrice)}</span>
            )}
          </div>

          {/* ── Flash sale ── */}
          {discPct > 0 && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs">⚡</span>
              <span className="text-xs font-bold" style={{ color: ACCENT }}>Flash sale ends in</span>
              <span className="text-xs font-black px-1.5 py-0.5 rounded" style={{ color: ACCENT, background: "#fff0f4", fontVariantNumeric: "tabular-nums" }}>{countdown}</span>
            </div>
          )}

          {/* ── Free shipping ── */}
          <div className="flex items-center gap-1.5 mb-3">
            <Truck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: TEAL }} />
            <span className="text-xs font-bold" style={{ color: TEAL }}>Free shipping · 1–3 day delivery</span>
          </div>

          {/* ── Product name ── */}
          <h1 className="font-bold leading-snug mb-2" style={{ fontSize: 16, color: BLACK }}>
            {product.name}
          </h1>

          {/* ── Rating row ── */}
          <div className="flex items-center gap-2 mb-1.5">
            <StarDisplay value={product.rating_avg} size="md" />
            <span className="text-xs font-semibold" style={{ color: BLACK }}>{product.rating_avg.toFixed(1)}</span>
            <span className="text-xs" style={{ color: MUTED }}>| {soldCount.toLocaleString()} sold</span>
          </div>

          {/* ── Badges row ── */}
          <div className="flex items-center gap-2 mb-3">
            {product.rating_avg >= 4.5 && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded"
                style={{ color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a" }}>Most Loved</span>
            )}
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded"
              style={{ color: "#374151", background: "#f3f4f6", border: "1px solid #e5e7eb" }}>Free returns</span>
            {isPE && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded"
                style={{ color: "#1e3a8a", background: "#eff6ff", border: "1px solid #bfdbfe" }}>🎖️ PE Price</span>
            )}
          </div>

          {/* ── Hairline ── */}
          <div className="h-px mb-3" style={{ background: "#f0f0f0" }} />

          {/* ── PE Price block ── */}
          {showPE && (
            <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-3"
              style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <div>
                <div className="text-xs font-semibold mb-0.5" style={{ color: "#1e40af" }}>🎖️ Your Public Employee Price</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs" style={{ color: MUTED }}>ETB</span>
                  <span className="text-lg font-black" style={{ color: BLACK }}>{moneyNum(pePrice)}</span>
                </div>
              </div>
              <div className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: "#1e3a8a", color: "#fff" }}>
                Save {moneyNum(displayPrice - (pePrice ?? 0))}
              </div>
            </div>
          )}

          {/* ── Variant error ── */}
          {variantErr && (
            <div className="rounded-lg px-3 py-2 text-xs mb-3" style={{ background: "#fff5f5", border: `1px solid ${RED}`, color: RED }}>
              {variantErr}
            </div>
          )}

          {/* ── Color selector ── */}
          {hasColors && (
            <div className="mb-3">
              <div className="text-xs font-semibold mb-2" style={{ color: BLACK }}>
                Color {selColor && <span className="font-normal" style={{ color: MUTED }}>— {selColor.name}</span>}
              </div>
              <div className="flex gap-2.5 flex-wrap">
                {product.color_variants!.map(cv => {
                  const sel = selColorId === cv.id;
                  return (
                    <button key={cv.id} onClick={() => { setSelColorId(sel ? null : cv.id); setVariantErr(null); }}
                      className="relative transition-all"
                      style={{ width: 30, height: 30, borderRadius: "50%", background: cv.hex, cursor: "pointer",
                        border: sel ? `3px solid ${BLACK}` : `2px solid ${BORDER}`,
                        boxShadow: sel ? `0 0 0 2px rgba(17,24,39,0.15)` : "none",
                        outline: "none" }} />
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Size selector ── */}
          {hasSizes && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold" style={{ color: BLACK }}>
                  Size {selSize && <span className="font-normal" style={{ color: MUTED }}>— {selSize.label}</span>}
                </div>
                {needsSize && <span className="text-[10px] font-bold" style={{ color: RED }}>Required</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {product.size_variants!.map(sv => {
                  const sel = selSizeId === sv.id, oos = sv.stock <= 0, low = !oos && sv.stock <= 5;
                  return (
                    <button key={sv.id} disabled={oos}
                      onClick={() => { setSelSizeId(sel ? null : sv.id); setVariantErr(null); }}
                      className="relative transition-all text-xs font-semibold"
                      style={{ padding: "6px 11px", borderRadius: 8, fontFamily: F,
                        border: `1.5px solid ${oos ? BORDER : sel ? BLACK : BORDER}`,
                        background: oos ? BG : sel ? BLACK : "#fff",
                        color: oos ? "#d1d5db" : sel ? "#fff" : BLACK,
                        textDecoration: oos ? "line-through" : "none",
                        cursor: oos ? "not-allowed" : "pointer" }}>
                      {sv.label}
                      {oos && <span className="absolute -top-1.5 -right-1.5 text-[8px] font-bold px-1 rounded"
                        style={{ background: "#fca5a5", color: "#7f1d1d" }}>Out of stock </span>}
                      {low && <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full border-2 border-white"
                        style={{ background: RED }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Quantity ── */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-semibold" style={{ color: BLACK }}>Qty</span>
            <div className="flex items-center overflow-hidden" style={{ border: `1.5px solid ${BORDER}`, borderRadius: 8 }}>
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 text-lg transition-colors"
                style={{ color: BLACK, fontFamily: F }}>−</button>
              <span className="w-8 h-8 flex items-center justify-center text-sm font-bold"
                style={{ color: BLACK, borderLeft: `1.5px solid ${BORDER}`, borderRight: `1.5px solid ${BORDER}` }}>{quantity}</span>
              <button onClick={() => setQuantity(q => q + 1)}
                className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 text-lg transition-colors"
                style={{ color: BLACK, fontFamily: F }}>+</button>
            </div>
            {effectiveStock !== null && (
              <div className="flex items-center gap-1">
                <Package className="w-3.5 h-3.5" style={{ color: MUTED }} />
                <StockBadge stock={effectiveStock} />
              </div>
            )}
          </div>

          {/* ── Hairline ── */}
          <div className="h-px mb-3" style={{ background: "#f0f0f0" }} />

          {/* ── Description ── */}
          {product.description && (
            <div className="mb-4">
              <div className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: MUTED }}>About this item</div>
              <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "#4b5563" }}>{product.description}</p>
            </div>
          )}

          {/* ── Delivery details ── */}
          <div className="rounded-xl p-3 mb-4 space-y-2" style={{ background: BG, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2">
              <Truck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: TEAL }} />
              <span className="text-xs" style={{ color: BLACK }}>
                Estimated delivery <strong>{getDeliveryDate()}</strong>
                <span style={{ color: MUTED }}> · 24 hrs</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Return className="w-3.5 h-3.5 flex-shrink-0" style={{ color: MUTED }} />
              <span className="text-xs" style={{ color: BLACK }}><strong>Free returns</strong> <span style={{ color: MUTED }}>within 30 days</span></span>
            </div>
            {soldCount > 0 && (
              <div className="flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ACCENT }} />
                <span className="text-xs font-bold" style={{ color: ACCENT }}>{soldCount.toLocaleString()} sold</span>
                <span className="text-xs" style={{ color: MUTED }}>· 47 people viewing now</span>
              </div>
            )}
          </div>

          {/* ── Similar items ── */}
          {similar.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: MUTED }}>You May Also Like</div>
              <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                {similar.slice(0, 8).map(p => (
                  <MiniCard key={p.id} product={p} onClick={() => router.push(`/shop/${p.id}`)} isPE={isPE} />
                ))}
              </div>
            </div>
          )}

          {/* ── Rate this product ── */}
          <div className="rounded-xl p-4" style={{ background: BG, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold" style={{ color: BLACK }}>Rate this product</div>
              {myRating > 0 && <span className="text-xs" style={{ color: MUTED }}>You rated {myRating}/5</span>}
            </div>
            <StarInput value={myRating} onChange={handleRating} disabled={ratingSaving} />
            <p className="text-xs mt-2" style={{ color: MUTED }}>{userId ? "Tap a star to rate." : "Sign in to rate."}</p>
            {ratingMsg && <div className="text-xs mt-1" style={{ color: BLACK }}>{ratingMsg}</div>}
          </div>
        </div>

        {/* ── Mobile sticky bottom bar ── */}
        <div className="fixed inset-x-0 z-40 px-3"
          style={{ bottom: "max(12px, calc(env(safe-area-inset-bottom) + 8px))" }}>
          <div className="rounded-[28px] border bg-white/95 px-3 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl"
            style={{ borderColor: BORDER }}>
            <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
              <VariantPill color={selColor} size={selSize} />
              <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: MUTED }}>
                <span className="rounded-full px-2.5 py-1" style={{ background: BG, color: BLACK }}>
                  Qty {quantity}
                </span>
                {cartQty > 0 && (
                  <span className="rounded-full px-2.5 py-1" style={{ background: "#ecfdf5", color: "#047857" }}>
                    {cartQty} in cart
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={handleAddToCart} disabled={addedToCart || cantAdd}
                className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-full text-sm font-bold transition-all active:scale-[0.98]"
                style={{
                  fontFamily: F,
                  background: addedToCart ? BLACK : cantAdd ? BG : "#f1f5f9",
                  color: addedToCart ? "#fff" : cantAdd ? MUTED : BLACK,
                  border: `1.5px solid ${cantAdd && !addedToCart ? BORDER : "transparent"}`,
                  cursor: cantAdd ? "not-allowed" : "pointer",
                }}>
                {addedToCart ? <><Check className="w-4 h-4" /> Added!</> : <><ShoppingCart className="w-4 h-4" /> {addLabel()}</>}
              </button>
              <button onClick={(e) => { if (handleAddToCart(e)) router.push("/checkout"); }}
                disabled={cantAdd}
                className="flex-1 flex flex-col items-center justify-center py-2.5 rounded-full text-sm font-black transition-all active:scale-[0.98]"
                style={{ fontFamily: F, background: cantAdd ? "#fca5a5" : ACCENT, color: "#fff", border: "none", cursor: cantAdd ? "not-allowed" : "pointer" }}>
                <span>Buy Now</span>
                <span className="text-[11px] font-semibold leading-none opacity-90">Free shipping</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden below lg)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block">
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 mb-8 flex-wrap">
            {[
              { label: "Home",  onClick: () => router.push("/") },
              { label: "Shop",  onClick: () => router.push("/shop") },
              ...(product.category_name ? [{
                label: normCat(product.category_name),
                onClick: () => router.push(`/shop?category=${encodeURIComponent(product.category_id ?? "")}`),
              }] : []),
            ].map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <button onClick={c.onClick} className="hover:underline text-sm transition-colors" style={{ color: MUTED }}>{c.label}</button>
                <ChevronRight className="w-3 h-3" style={{ color: BORDER }} />
              </span>
            ))}
            <span className="text-sm truncate max-w-xs" style={{ color: BLACK }}>{product.name}</span>
          </nav>

          {pageError && (
            <div className="mb-6 rounded-xl px-4 py-3 text-sm" style={{ border: `1px solid ${RED}`, background: "#fff5f5", color: RED }}>{pageError}</div>
          )}

          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] items-start">

            {/* ── Desktop gallery ── */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex gap-4 p-6">
                {/* Thumbnails */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {allImages.length === 0
                    ? <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">{product.emoji || "🛍️"}</div>
                    : allImages.map((src, i) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 transition-all"
                        style={{ border: `2px solid ${i === imgIdx ? BLACK : BORDER}` }}>
                        <img src={src} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))
                  }
                </div>
                {/* Main image */}
                <div className="flex-1 aspect-square rounded-2xl overflow-hidden relative bg-slate-50 flex items-center justify-center">
                  {activeImg
                    ? <img src={activeImg} alt={product.name} className="w-full h-full object-contain transition-all duration-300" />
                    : <div className="text-center"><div className="text-7xl mb-2">{product.emoji || "🛍️"}</div></div>}
                  {discPct > 0 && (
                    <div className="absolute top-0 left-0 text-white text-sm px-4 py-2 font-bold"
                      style={{ background: ACCENT, borderRadius: "0 0 14px 0" }}>-{discPct}%</div>
                  )}
                  {selColor && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full px-3 py-1.5"
                      style={{ background: "rgba(255,255,255,0.95)", border: `1px solid ${BORDER}` }}>
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selColor.hex, border: `1px solid ${BORDER}` }} />
                      <span className="text-xs" style={{ color: BLACK }}>{selColor.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Desktop info ── */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>

                {/* Name */}
                <h1 className="font-bold leading-tight mb-3" style={{ fontSize: 26, color: BLACK }}>{product.name}</h1>

                {/* Rating */}
                <div className="flex items-center gap-3 mb-4">
                  <StarDisplay value={product.rating_avg} size="md" />
                  <span className="text-sm" style={{ color: BLACK }}>
                    {product.rating_count ? `${product.rating_avg.toFixed(1)} out of 5` : "No ratings yet"}
                  </span>
                  {product.rating_count > 0 && <span className="text-sm" style={{ color: MUTED }}>· {product.rating_count} ratings</span>}
                </div>

                {/* Delivery strip */}
                <div style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: "12px 0", marginBottom: 20 }}>
                  {[
                    { icon: <Truck className="w-4 h-4" style={{ color: TEAL }} />, text: <span style={{ color: BLACK }}>Delivery by <strong>{getDeliveryDate()}</strong></span>, sub: "24 hrs" },
                    { icon: <Return className="w-4 h-4" style={{ color: MUTED }} />, text: <span style={{ color: BLACK }}><strong>Free returns</strong></span>, sub: "within 30 days" },
                    ...(soldCount > 0 ? [{ icon: <Flame className="w-4 h-4" style={{ color: ACCENT }} />, text: <span style={{ color: ACCENT, fontWeight: 600 }}>{soldCount.toLocaleString()} sold</span>, sub: "47 viewing now" }] : []),
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2 last:mb-0">
                      {row.icon}
                      <span className="text-sm">{row.text}</span>
                      <span className="text-xs" style={{ color: MUTED }}>· {row.sub}</span>
                    </div>
                  ))}
                </div>

                {variantErr && (
                  <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ border: `1px solid ${RED}`, background: "#fff5f5", color: RED }}>{variantErr}</div>
                )}

                {/* Color selector */}
                {hasColors && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-medium" style={{ color: BLACK }}>
                        Color {selColor && <span style={{ color: MUTED }}>— {selColor.name}</span>}
                      </span>
                      {selColorId && (
                        <button onClick={() => { setSelColorId(null); setVariantErr(null); }}
                          className="flex items-center gap-1 text-xs hover:opacity-60 transition-opacity" style={{ color: MUTED }}>
                          <RotateCcw className="w-3 h-3" /> Clear
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {product.color_variants!.map(cv => {
                        const sel = selColorId === cv.id;
                        return (
                          <button key={cv.id} onClick={() => { setSelColorId(sel ? null : cv.id); setVariantErr(null); }}
                            className="relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                            style={{ border: `2px solid ${sel ? BLACK : BORDER}`, background: sel ? BLACK : "#fff", color: sel ? "#fff" : BLACK }}>
                            <span className="w-4 h-4 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cv.hex, border: `1.5px solid ${sel ? "rgba(255,255,255,0.4)" : BORDER}` }} />
                            {cv.name}
                            {sel && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ background: ACCENT }}>
                              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                            </span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Size selector */}
                {hasSizes && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-medium" style={{ color: BLACK }}>
                        Size {selSize && <span style={{ color: MUTED }}>— {selSize.label}</span>}
                      </span>
                      <div className="flex items-center gap-3">
                        {needsSize && <span className="text-xs font-semibold" style={{ color: RED }}>Required</span>}
                        {selSizeId && (
                          <button onClick={() => { setSelSizeId(null); setVariantErr(null); }}
                            className="flex items-center gap-1 text-xs hover:opacity-60 transition-opacity" style={{ color: MUTED }}>
                            <RotateCcw className="w-3 h-3" /> Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {product.size_variants!.map(sv => {
                        const sel = selSizeId === sv.id, oos = sv.stock <= 0, low = !oos && sv.stock <= 5;
                        return (
                          <button key={sv.id} disabled={oos}
                            onClick={() => { setSelSizeId(sel ? null : sv.id); setVariantErr(null); }}
                            className="relative min-w-[3rem] px-3 py-2 rounded-xl text-sm transition-all"
                            style={{ fontFamily: F, border: `2px solid ${oos ? BORDER : sel ? BLACK : BORDER}`,
                              background: oos ? BG : sel ? BLACK : "#fff",
                              color: oos ? "#c4c4c4" : sel ? "#fff" : BLACK,
                              textDecoration: oos ? "line-through" : "none", cursor: oos ? "not-allowed" : "pointer" }}>
                            {sv.label}
                            {sv.priceAdjustCents !== 0 && !oos && (
                              <span
                                className="absolute -top-2 -right-2 text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{
                                  fontFamily: F,
                                  background: sel ? ACCENT : BG,
                                  color: sel ? "#fff" : ACCENT,
                                  border: `1px solid ${sel ? ACCENT : BORDER}`
                                }}>
                                {sv.priceAdjustCents > 0 ? "+" : ""}
                                {(sv.priceAdjustCents / 100).toFixed(0)}
                              </span>
                            )}
                            {low && (
                              <span
                                className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full border-2 border-white"
                                style={{ background: RED }}
                              />
                            )}
                            {oos && (
                              <span
                                className="absolute -top-2 -right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "#fca5a5", color: "#7f1d1d" }}
                              >
                                Out of stock
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {selSize && (
                      <div className="flex items-center gap-2 mt-2">
                        <Package className="w-3.5 h-3.5" style={{ color: MUTED }} />
                        <StockBadge stock={selSize.stock} />
                      </div>
                    )}
                  </div>
                )}

                {/* Price block */}
                <div className="rounded-xl p-4 mb-4" style={{ background: BG, border: `1px solid ${BORDER}` }}>
                  {discPct > 0 && <div className="text-xs font-black mb-1" style={{ color: ACCENT }}>-{discPct}% OFF</div>}
                  {origPrice && <div className="text-sm mb-1" style={{ color: MUTED }}>ETB <span style={{ textDecoration: "line-through" }}>{moneyVal(origPrice)}</span></div>}
                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium" style={{ color: ACCENT }}>ETB</span>
                    <span className="font-black tracking-tight" style={{ fontSize: 34, color: BLACK, letterSpacing: "-1px", lineHeight: 1 }}>{moneyVal(displayPrice)}</span>
                  </div>
                  {sizeAdj !== 0 && selSize && <div className="text-xs mb-1" style={{ color: RED }}>{sizeAdj > 0 ? "+" : ""}{money(sizeAdj)} for size {selSize.label}</div>}
                  {origPrice && <div className="text-sm" style={{ color: BLACK }}>You save {money(origPrice - basePrice)}</div>}
                  {!hasSizes && product.stock_quantity !== null && (
                    <div className="flex items-center gap-2 mt-2">
                      <Package className="w-3.5 h-3.5" style={{ color: MUTED }} />
                      <StockBadge stock={product.stock_quantity} />
                    </div>
                  )}
                  {showPE && (
                    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                      <div className="text-xs mb-1" style={{ color: MUTED }}>🎖️ Public Employee Price</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm" style={{ color: ACCENT }}>ETB</span>
                        <span className="text-2xl font-bold" style={{ color: BLACK }}>{moneyVal(pePrice)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Qty + Add to Cart */}
                <div className="flex items-center gap-3 mb-3">
                  <QtySelector value={quantity} onChange={setQuantity} min={1} max={effectiveStock ?? 99} />
                  <button onClick={handleAddToCart} disabled={addedToCart || cantAdd}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                    style={{ fontFamily: F,
                      background: addedToCart ? BLACK : cantAdd ? BG : `linear-gradient(90deg,#22c55e,#a3e635)`,
                      color: addedToCart ? "#fff" : cantAdd ? MUTED : BLACK,
                      border: `1.5px solid ${cantAdd && !addedToCart ? BORDER : "transparent"}`,
                      cursor: cantAdd ? "not-allowed" : "pointer" }}>
                    {addedToCart ? <><Check className="w-4 h-4" /> Added!</> : <><ShoppingCart className="w-4 h-4" /> {addLabel()}</>}
                  </button>
                </div>

                <VariantPill color={selColor} size={selSize} />

                {/* In cart */}
                {cartQty > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm mb-3"
                    style={{ background: BG, border: `1px solid ${BORDER}`, color: BLACK }}>
                    <ShoppingCart className="w-4 h-4 flex-shrink-0" style={{ color: MUTED }} />
                    {cartQty} item{cartQty !== 1 ? "s" : ""} in your cart
                  </div>
                )}

                {/* Checkout */}
                {cartQty > 0 && (
                  <button onClick={() => router.push("/checkout")}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm transition-all"
                    style={{ fontFamily: F, color: BLACK, border: `1.5px solid ${BLACK}`, background: "#fff" }}>
                    Proceed to Checkout <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Description */}
              <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
                <div className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: MUTED }}>About this item</div>
                {product.description
                  ? <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#4b5563" }}>{product.description}</p>
                  : <p className="text-sm italic" style={{ color: MUTED }}>No description available.</p>}
              </div>

              {/* Rate */}
              <div className="bg-white rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-black uppercase tracking-widest" style={{ color: MUTED }}>Your rating</div>
                  {myRating > 0 && <span className="text-xs" style={{ color: MUTED }}>You rated {myRating}/5</span>}
                </div>
                <StarInput value={myRating} onChange={handleRating} disabled={ratingSaving} />
                <p className="text-xs mt-2" style={{ color: MUTED }}>{userId ? "Click a star to rate." : "Sign in to leave a rating."}</p>
                {ratingMsg && <div className="text-xs mt-1" style={{ color: BLACK }}>{ratingMsg}</div>}
              </div>
            </div>
          </div>

          {/* More from seller */}
          {moreFromSeller.length > 0 && (
            <section className="mt-12">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold" style={{ color: BLACK }}>More from this seller</h2>
                <span className="text-xs" style={{ color: MUTED }}>{moreFromSeller.length} items</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
                {moreFromSeller.map(p => <MiniCard key={p.id} product={p} onClick={() => router.push(`/shop/${p.id}`)} isPE={isPE} />)}
              </div>
            </section>
          )}

          {/* Similar items */}
          {similar.length > 0 && (
            <section className="mt-10 mb-14">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold" style={{ color: BLACK }}>Similar items</h2>
                <span className="text-xs" style={{ color: MUTED }}>You might also like</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
                {similar.map(p => <MiniCard key={p.id} product={p} onClick={() => router.push(`/shop/${p.id}`)} isPE={isPE} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
