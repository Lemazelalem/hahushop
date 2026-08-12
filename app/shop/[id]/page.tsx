"use client";

import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import type { ItemMeta } from "@/components/MiniCartProvider";
import { flyToCart } from "@/lib/flyToCart";
import { ShoppingCart, Check, Minus, Plus, X } from "lucide-react";
import { getCached, setCached, productCacheKey } from "@/lib/productCache";
import { useLoadingTimeout, useResumeRefresh } from "../_useResumeRefresh";

type ProductStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

type ColorVariant = { id: string; name: string; hex: string; imageUrl: string; extraImageUrls: string[] };

type SizeVariant = { id: string; label: string; stock: number; priceAdjustCents: number };

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  status: ProductStatus;
  price_cents: number | null;
  final_price_cents: number | null;
  seller_price_cents: number | null;
  public_employee_price_cents: number | null;
  image_url: string | null;
  extra_image_urls: string[] | null;
  category: {
    name: string | null;
  } | null;
  stock_quantity: number | null;
  color_variants: ColorVariant[] | null;
  size_variants: SizeVariant[] | null;
};


type RatingStats = {
  avg: number;
  count: number;
  myRating: number | null;
};

const BLACK = "#111827";
const ACCENT = "#FF0255";
const SURFACE = "#ffffff";
const BORDER = "#e2e8f0";

function money(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "-";
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function clampRating(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function isLikelyUuid(id: string | undefined): boolean {
  if (!id) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    id
  );
}

function clampQuantity(n: number) {
  const safe = Math.floor(Number(n) || 1);
  return Math.min(99, Math.max(1, safe));
}

function StarsRow({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
}) {
  const isInteractive = !!onChange;
  const starClass =
    size === "sm"
      ? "text-[14px] leading-none"
      : size === "lg"
      ? "text-[30px] md:text-[32px] leading-none"
      : "text-[18px] md:text-[20px] leading-none";

  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        return (
          <button
            key={n}
            type="button"
            aria-label={isInteractive ? `Rate ${n} star${n === 1 ? "" : "s"}` : undefined}
            onClick={isInteractive ? () => onChange(n) : undefined}
            disabled={!isInteractive}
            className={[
              "transition-transform",
              isInteractive ? "px-0.5 py-1 hover:-translate-y-[1px] active:scale-95" : "",
            ].join(" ")}
          >
            <span
              className={[
                starClass,
                filled ? "text-amber-400 drop-shadow-sm" : "text-slate-300",
              ].join(" ")}
            >
              {"\u2605"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params?.id as string | undefined;
  const { addItem, cart } = useMiniCart();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);
  const [selectedQty, setSelectedQty] = useState(1);

  const [selColorId, setSelColorId] = useState<string | null>(null);
  const [selSizeId, setSelSizeId] = useState<string | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [variantErr, setVariantErr] = useState<string | null>(null);

  const [ratingStats, setRatingStats] = useState<RatingStats>({
    avg: 0,
    count: 0,
    myRating: null,
  });
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [rateMsg, setRateMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const rateSectionRef = useRef<HTMLDivElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const cartQuantity = useMemo(() => {
    if (!product) return 0;
    return cart
      .filter(
        (item) =>
          item.id === product.id &&
          (item.kind === "approved" || item.kind === "approved_public")
      )
      .reduce((sum, item) => sum + item.quantity, 0);
  }, [cart, product]);

  const currentProductId = typeof productId === "string" ? productId : undefined;

  useEffect(() => {
    if (!currentProductId || !isLikelyUuid(currentProductId)) {
      setProduct(null);
      setPageError("Product not found.");
      setLoading(false);
      return;
    }

    const productIdForLoad = currentProductId;
    let cancelled = false;

    async function load() {
      setPageError(null);

      // Serve from cache immediately if available
      const cacheKey = productCacheKey(productIdForLoad);
      const cached = getCached<ProductRow>(cacheKey);
      if (cached) {
        setProduct(cached);
        setLoading(false);
        // Still refresh in background silently
      } else {
        setLoading(true);
      }

      try {
        // Read the session locally (no network round-trip). getUser() hits the
        // auth server and can hang after a WebView resume, blocking the product.
        let uid: string | null = null;
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          uid = sessionData?.session?.user?.id ?? null;
        } catch {
          uid = null;
        }
        if (cancelled) return;
        setUserId(uid);

        const { data: productData, error: productError } = await supabase
          .from("products")
          .select(
            `
            id,
            name,
            description,
            emoji,
            status,
            price_cents,
            final_price_cents,
            seller_price_cents,
            public_employee_price_cents,
            image_url,
            extra_image_urls,
            stock_quantity,
            color_variants,
            size_variants,
            category:categories(name)
          `
          )
          .eq("id", productIdForLoad)
          .eq("status", "approved")
          .eq("is_active", true)
          .maybeSingle();

        if (cancelled) return;

        if (productError) {
          console.warn("Load product error:", productError);
          setPageError(productError.message || "Could not load product.");
          setLoading(false);
          return;
        }

        if (!productData) {
          setProduct(null);
          setPageError("Product not found or not available.");
          setLoading(false);
          return;
        }

        const normalizedProduct: ProductRow = {
          ...productData,
          category: Array.isArray(productData.category)
            ? productData.category[0] ?? null
            : productData.category ?? null,
        } as ProductRow;

        setCached(productCacheKey(productIdForLoad), normalizedProduct);
        setProduct(normalizedProduct);
        await loadRatings(productIdForLoad, uid);
      } catch (err) {
        console.error("Unexpected error loading product detail:", err);
        if (!cancelled) setPageError("Unexpected error while loading product.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadRatings(prodId: string, uid: string | null) {
      try {
        setRatingLoading(true);

        const { data: allRatings, error: ratingsError } = await supabase
          .from("product_ratings")
          .select("rating")
          .eq("product_id", prodId);

        if (ratingsError) {
          console.warn("Load ratings error (non-fatal):", ratingsError);
        }

        let avg = 0;
        let count = 0;

        if (allRatings && allRatings.length > 0) {
          count = allRatings.length;
          const sum = allRatings.reduce((acc, r) => acc + (r as any).rating, 0);
          avg = sum / count;
        }

        let myRating: number | null = null;

        if (uid) {
          const { data: myRow } = await supabase
            .from("product_ratings")
            .select("rating")
            .eq("product_id", prodId)
            .eq("user_id", uid)
            .maybeSingle();

          if (myRow) myRating = (myRow as any).rating;
        }

        if (cancelled) return;

        setRatingStats({
          avg,
          count,
          myRating,
        });
      } finally {
        if (!cancelled) setRatingLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [currentProductId, reloadKey]);

  // Recover from a frozen WebView / flaky network: reopening the app re-fetches
  // instead of leaving a permanent skeleton.
  useResumeRefresh(() => {
    setReloadKey((k) => k + 1);
  });

  // Safety net: if the product fetch hangs (e.g. auth lock after resume), unblock
  // the UI and offer a retry instead of an endless blank skeleton.
  useLoadingTimeout(loading, () => {
    setLoading(false);
    setPageError("Loading timed out. Tap Retry to try again.");
  });

  const selColor = useMemo(
    () => product?.color_variants?.find((c) => c.id === selColorId) ?? null,
    [product, selColorId]
  );
  const selSize = useMemo(
    () => product?.size_variants?.find((s) => s.id === selSizeId) ?? null,
    [product, selSizeId]
  );

  const allImages = useMemo(() => {
    if (!product) return [] as string[];
    if (selColor) {
      const list: string[] = [];
      if (selColor.imageUrl) list.push(selColor.imageUrl);
      for (const u of selColor.extraImageUrls ?? [])
        if (u && !list.includes(u)) list.push(u);
      if (list.length) return list;
    }
    const list: string[] = [];
    if (product.image_url) list.push(product.image_url);
    for (const u of product.extra_image_urls ?? [])
      if (u && !list.includes(u)) list.push(u);
    return list;
  }, [product, selColor]);

  // Reset image index when color changes
  useEffect(() => { setImgIdx(0); }, [selColorId]);
  const activeImg = allImages[imgIdx] ?? allImages[0] ?? null;

  const basePriceCents = useMemo(() => {
    if (!product) return 0;
    if (product.final_price_cents && product.final_price_cents > 0)
      return product.final_price_cents;
    return product.price_cents ?? product.seller_price_cents ?? 0;
  }, [product]);

  const unitPriceCents = useMemo(
    () => basePriceCents + (selSize?.priceAdjustCents ?? 0),
    [basePriceCents, selSize]
  );

  const displayPrice = useMemo(() => {
    if (!product) return "-";
    return money(unitPriceCents);
  }, [product, unitPriceCents]);

  const totalPrice = useMemo(() => {
    return money(unitPriceCents * selectedQty);
  }, [unitPriceCents, selectedQty]);

  const originalPrice = useMemo(() => {
    if (!product?.seller_price_cents) return null;
    if (
      product.final_price_cents &&
      product.final_price_cents < product.seller_price_cents
    ) {
      return money(product.seller_price_cents);
    }
    return null;
  }, [product]);

  function increaseQty() {
    setSelectedQty((prev) => clampQuantity(prev + 1));
  }

  function decreaseQty() {
    setSelectedQty((prev) => clampQuantity(prev - 1));
  }

  function handleQtyInput(value: string) {
    if (value.trim() === "") {
      setSelectedQty(1);
      return;
    }
    setSelectedQty(clampQuantity(Number(value)));
  }

  function showAddedState() {
    setAddedToCart(true);
    window.setTimeout(() => setAddedToCart(false), 2000);
  }

  const stock = useMemo(() => {
    if (!product) return null;
    if ((product.size_variants?.length ?? 0) > 0) return selSize?.stock ?? null;
    return product.stock_quantity;
  }, [product, selSize]);
  const isOOS = stock !== null && stock <= 0;

  function handleAddToCart(e?: MouseEvent<HTMLButtonElement>) {
    if (!product) return;
    const hasColors = (product.color_variants?.length ?? 0) > 0;
    const hasSizes  = (product.size_variants?.length ?? 0) > 0;
    if (hasSizes && !selSizeId)   { setVariantErr("Please select a size."); return; }
    if (hasColors && !selColorId) { setVariantErr("Please select a color."); return; }
    if (isOOS) return;
    setVariantErr(null);
    const meta: ItemMeta | undefined =
      hasColors || hasSizes
        ? {
            colorVariantId: selColorId ?? null,
            colorName: selColor?.name ?? null,
            sizeVariantId: selSizeId ?? null,
            sizeLabel: selSize?.label ?? null,
            priceAdjustCents: selSize?.priceAdjustCents ?? 0,
            finalPriceCents: unitPriceCents,
          }
        : undefined;
    addItem("approved", product.id, selectedQty, meta);
    flyToCart({ sourceEl: e?.currentTarget, imageUrl: activeImg || product.image_url });
    showAddedState();
  }

  function handleShopNow(e?: MouseEvent<HTMLButtonElement>) {
    if (!product) return;
    const hasColors = (product.color_variants?.length ?? 0) > 0;
    const hasSizes  = (product.size_variants?.length ?? 0) > 0;
    if (hasSizes && !selSizeId)   { setVariantErr("Please select a size."); return; }
    if (hasColors && !selColorId) { setVariantErr("Please select a color."); return; }
    if (isOOS) return;
    setVariantErr(null);
    const meta: ItemMeta | undefined =
      hasColors || hasSizes
        ? {
            colorVariantId: selColorId ?? null,
            colorName: selColor?.name ?? null,
            sizeVariantId: selSizeId ?? null,
            sizeLabel: selSize?.label ?? null,
            priceAdjustCents: selSize?.priceAdjustCents ?? 0,
            finalPriceCents: unitPriceCents,
          }
        : undefined;
    addItem("approved", product.id, selectedQty, meta);
    flyToCart({ sourceEl: e?.currentTarget, imageUrl: activeImg || product.image_url });
    showAddedState();
    router.push("/checkout");
  }

  async function handleRate(newValue: number) {
    if (!product || !product.id) return;

    if (!userId) {
      setRateMsg({ kind: "err", text: "You must be signed in to rate this product." });
      return;
    }

    const safeValue = clampRating(newValue);

    try {
      setRatingSaving(true);
      setRateMsg(null);

      const { error } = await supabase.from("product_ratings").upsert(
        {
          product_id: product.id,
          user_id: userId,
          rating: safeValue,
        },
        {
          onConflict: "product_id,user_id",
        }
      );

      if (error) {
        console.error("Save rating error:", error);
        setRateMsg({ kind: "err", text: error.message || "Could not save rating." });
        return;
      }

      const prev = ratingStats;
      let newAvg = prev.avg;
      let newCount = prev.count;
      const previouslyRated = prev.myRating !== null;

      if (!previouslyRated) {
        newCount = prev.count + 1;
        newAvg = (prev.avg * prev.count + safeValue) / newCount;
      } else {
        if (prev.count > 0) {
          const totalBefore = prev.avg * prev.count;
          const totalAfter = totalBefore - prev.myRating! + safeValue;
          newAvg = totalAfter / prev.count;
        } else {
          newAvg = safeValue;
          newCount = 1;
        }
      }

      setRatingStats({
        avg: newAvg,
        count: newCount,
        myRating: safeValue,
      });
      setRateMsg({ kind: "ok", text: "Thanks! Your rating was saved." });
      window.setTimeout(() => setRateMsg(null), 3000);
    } catch (err) {
      console.error("Unexpected rating error:", err);
      setRateMsg({ kind: "err", text: "Unexpected error while saving rating." });
    } finally {
      setRatingSaving(false);
    }
  }

  const avgLabel = useMemo(() => {
    if (!ratingStats.count) return "No ratings yet";
    return `${ratingStats.avg.toFixed(1)} out of 5`;
  }, [ratingStats]);

  const categoryLabel = product?.category?.name?.trim() || "Uncategorized";

  return (
    <main className="min-h-screen bg-white md:bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-4 md:px-8 md:py-6 pb-32 md:pb-6">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push("/shop")}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 mb-3"
          >
            <span>{"\u2190"}</span>
            <span>Back to Shop</span>
          </button>

          {pageError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <span className="text-sm text-rose-700">{pageError}</span>
              <button
                type="button"
                onClick={() => {
                  setPageError(null);
                  setLoading(true);
                  setReloadKey((k) => k + 1);
                }}
                className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        <div className="overflow-hidden md:bg-white md:rounded-2xl md:shadow-sm md:border md:border-slate-200">
          {!product ? (
            // Hide the skeleton once an error is shown above so we don't leave a
            // permanent shimmer under the error message.
            loading || !pageError ? (
              <div className="p-8 animate-pulse">
                <div className="grid gap-8 md:grid-cols-2">
                  <div className="aspect-square bg-slate-200 rounded-xl" />
                  <div className="space-y-4">
                    <div className="h-8 w-3/4 bg-slate-200 rounded-lg" />
                    <div className="h-4 w-1/2 bg-slate-200 rounded-lg" />
                    <div className="h-24 bg-slate-200 rounded-lg" />
                  </div>
                </div>
              </div>
            ) : null
          ) : (
            <div className="grid md:grid-cols-2 gap-0">
              <div className="pb-4 md:p-8 md:bg-slate-50">
                {/* Main image — click to open lightbox */}
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="block w-full aspect-square overflow-hidden flex items-center justify-center bg-white md:rounded-2xl md:border md:border-slate-200 cursor-zoom-in"
                >
                  {activeImg ? (
                    <img
                      src={activeImg}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <div className="text-6xl mb-2">{product.emoji || "\u{1F6CD}\uFE0F"}</div>
                      <div className="text-sm">No image available</div>
                    </div>
                  )}
                </button>

                {/* Thumbnail strip */}
                {allImages.length > 1 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {allImages.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setImgIdx(idx)}
                        className={[
                          "h-16 w-16 flex-shrink-0 rounded-lg border-2 overflow-hidden transition-all",
                          imgIdx === idx
                            ? "border-slate-900 ring-2 ring-slate-900/20"
                            : "border-slate-200 hover:border-slate-400",
                        ].join(" ")}
                      >
                        <img
                          src={url}
                          alt={`View ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-1 pt-5 pb-4 md:p-8 space-y-5 md:space-y-6">
                <div>
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-600 mb-3">
                    {categoryLabel}
                  </div>
                  <h1 className="text-[18px] md:text-3xl font-bold text-slate-900 leading-tight">
                    {product.name}
                  </h1>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <StarsRow value={ratingStats.avg || 0} size="md" />
                  <span className="text-[13px] md:text-sm text-slate-600">
                    {ratingLoading ? "Loading ratings..." : avgLabel}
                    {ratingStats.count > 0 && (
                      <span className="ml-1">
                        {" \u2022 "}{ratingStats.count} rating{ratingStats.count === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      rateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                    className="text-[13px] md:text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Rate it
                  </button>
                </div>

                {/* Variant error */}
                {variantErr && (
                  <div className="rounded-lg px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200">
                    {variantErr}
                  </div>
                )}

                {/* Color selector */}
                {(product.color_variants?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Color{selColor && <span className="font-normal text-slate-500"> — {selColor.name}</span>}
                    </div>
                    <div className="flex gap-2.5 flex-wrap">
                      {product.color_variants!.map((cv) => {
                        const sel = selColorId === cv.id;
                        return (
                          <button
                            key={cv.id}
                            type="button"
                            title={cv.name}
                            onClick={() => { setSelColorId(sel ? null : cv.id); setVariantErr(null); }}
                            className="transition-all"
                            style={{
                              width: 28, height: 28, borderRadius: "50%",
                              background: cv.hex, cursor: "pointer",
                              border: sel ? "3px solid #111827" : "2px solid #e2e8f0",
                              boxShadow: sel ? "0 0 0 2px rgba(17,24,39,0.15)" : "none",
                              outline: "none",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Size / storage selector */}
                {(product.size_variants?.length ?? 0) > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-slate-700">
                        Size{selSize && <span className="font-normal text-slate-500"> — {selSize.label}</span>}
                      </div>
                      {!selSizeId && (
                        <span className="text-[10px] font-bold text-rose-500">Required</span>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {product.size_variants!.map((sv) => {
                        const sel = selSizeId === sv.id;
                        const oos = sv.stock <= 0;
                        return (
                          <button
                            key={sv.id}
                            type="button"
                            disabled={oos}
                            onClick={() => { setSelSizeId(sel ? null : sv.id); setVariantErr(null); }}
                            className="relative text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                            style={{
                              border: `1.5px solid ${oos ? "#e2e8f0" : sel ? "#111827" : "#e2e8f0"}`,
                              background: oos ? "#f8fafc" : sel ? "#111827" : "#fff",
                              color: oos ? "#d1d5db" : sel ? "#fff" : "#111827",
                              textDecoration: oos ? "line-through" : "none",
                              cursor: oos ? "not-allowed" : "pointer",
                            }}
                          >
                            {sv.label}
                            {sv.priceAdjustCents !== 0 && !oos && (
                              <span className="ml-1 opacity-60 text-[9px]">
                                {sv.priceAdjustCents > 0 ? "+" : ""}
                                {money(Math.abs(sv.priceAdjustCents))}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="border-b border-slate-100 pb-5 md:bg-slate-50 md:rounded-xl md:border md:border-slate-100 md:p-4 md:pb-4">
                  <div className="text-xs md:text-sm text-slate-500 mb-1">Unit price</div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[22px] md:text-3xl font-bold md:font-black text-slate-900">
                      {displayPrice}
                    </span>
                    {originalPrice && (
                      <span className="text-lg text-slate-400 line-through">
                        {originalPrice}
                      </span>
                    )}
                  </div>

                  {originalPrice && (
                    <div className="mt-1 text-xs text-emerald-600 font-medium">
                      You save{" "}
                      {money(
                        product.seller_price_cents! -
                          (product.final_price_cents || product.seller_price_cents!)
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-slate-200/80">
                    <div className="text-xs md:text-sm text-slate-500 mb-2">Quantity</div>

                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <button
                          type="button"
                          onClick={decreaseQty}
                          className="h-11 w-11 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={selectedQty}
                          onChange={(e) => handleQtyInput(e.target.value)}
                          className="h-11 w-16 text-center text-sm font-bold text-slate-900 outline-none border-x border-slate-200"
                        />

                        <button
                          type="button"
                          onClick={increaseQty}
                          className="h-11 w-11 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="text-[13px] md:text-sm text-slate-600">
                        Total: <span className="font-bold text-slate-900">{totalPrice}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock indicator */}
                {stock !== null && (
                  <div className="mt-1">
                    {isOOS ? (
                      <span className="text-sm font-bold text-rose-600">Out of Stock</span>
                    ) : stock <= 5 ? (
                      <span className="text-sm font-semibold text-amber-600">Only {stock} left in stock</span>
                    ) : (
                      <span className="text-sm text-slate-500">{stock} in stock</span>
                    )}
                  </div>
                )}

                {/* Purchase actions belong on product details page */}
                <div className="hidden md:flex gap-3 flex-wrap">
                  <button
                    onClick={(e) => handleAddToCart(e)}
                    disabled={addedToCart || isOOS}
                    className={[
                      "flex-1 min-w-[160px] flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-sm transition-all",
                      isOOS
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : addedToCart
                        ? "bg-emerald-500 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 active:scale-[0.98]",
                    ].join(" ")}
                  >
                    {isOOS ? (
                      <>Out of Stock</>
                    ) : addedToCart ? (
                      <>
                        <Check className="w-5 h-5" />
                        Added {selectedQty}
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-5 h-5" />
                        Add to Cart
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleShopNow(e)}
                    disabled={isOOS}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-bold text-sm transition-all ${
                      isOOS ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-slate-900 text-white active:scale-[0.98]"
                    }`}
                  >
                    Shop Now
                  </button>
                </div>

                {cartQuantity > 0 && (
                  <button
                    type="button"
                    onClick={() => router.push("/checkout")}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium border border-emerald-100 hover:bg-emerald-100 transition"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    {cartQuantity} in cart{" \u2022 "}View Cart
                  </button>
                )}

                <div className="pt-1">
                  <h3 className="text-[13px] md:text-sm font-bold text-slate-900 mb-2">
                    Description
                  </h3>
                  <p className="text-[13px] md:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                    {product.description || "No description available for this product."}
                  </p>
                </div>

                <div ref={rateSectionRef} className="border-t border-slate-100 pt-6">
                  <h3 className="text-[13px] md:text-sm font-bold text-slate-900 mb-3">
                    Rate this product
                  </h3>

                  {userId ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <StarsRow
                          value={ratingStats.myRating || 0}
                          onChange={handleRate}
                          size="lg"
                        />
                        {ratingSaving && (
                          <span className="text-xs text-slate-500">Saving...</span>
                        )}
                      </div>
                      {rateMsg ? (
                        <p
                          className={`text-xs font-medium ${
                            rateMsg.kind === "ok" ? "text-emerald-600" : "text-rose-600"
                          }`}
                          role="status"
                        >
                          {rateMsg.text}
                        </p>
                      ) : ratingStats.myRating ? (
                        <p className="text-xs text-slate-500">
                          You rated this {ratingStats.myRating}/5 — tap a star to change it.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">Tap a star to rate.</p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/auth/login?returnUrl=${encodeURIComponent(`/shop/${product.id}`)}`
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] md:text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <span className="text-amber-400 text-base leading-none">{"\u2605"}</span>
                      Sign in to rate this product
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox overlay */}
      {lightboxOpen && activeImg && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Prev / Next arrows when multiple images */}
          {allImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setImgIdx((i) => (i - 1 + allImages.length) % allImages.length); }}
                className="absolute left-4 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition"
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setImgIdx((i) => (i + 1) % allImages.length); }}
                className="absolute right-16 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition"
                aria-label="Next"
              >
                ›
              </button>
            </>
          )}

          <img
            src={activeImg}
            alt={product?.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
          />

          {allImages.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
              {allImages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setImgIdx(i); }}
                  className={`w-2 h-2 rounded-full transition-all ${i === imgIdx ? "bg-white w-5" : "bg-white/40"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mobile sticky purchase bar */}
      {!loading && product && (
        <div
          className="md:hidden fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200 bg-white/98 backdrop-blur-xl"
        >
          <div className="mx-auto max-w-6xl px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="mb-2.5 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span
                className="rounded-full px-2.5 py-1 font-medium"
                style={{ background: "#f8fafc", color: BLACK }}
              >
                {selectedQty} item{selectedQty === 1 ? "" : "s"}{" \u2022 "}{totalPrice}
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                {cartQuantity} in cart
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={(e) => handleAddToCart(e)}
                disabled={addedToCart || isOOS}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-bold shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition-all active:scale-[0.98]"
                style={{
                  background: isOOS ? "#e2e8f0" : addedToCart ? BLACK : SURFACE,
                  color: isOOS ? "#94a3b8" : addedToCart ? "#fff" : BLACK,
                  border: `1.5px solid ${isOOS ? "#e2e8f0" : addedToCart ? BLACK : BORDER}`,
                  cursor: isOOS ? "not-allowed" : undefined,
                }}
              >
                {isOOS ? (
                  <>Out of Stock</>
                ) : addedToCart ? (
                  <>
                    <Check className="h-4 w-4" />
                    Added
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" />
                    Add to Cart
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => handleShopNow(e)}
                disabled={isOOS}
                className="flex-1 inline-flex items-center justify-center rounded-full px-4 py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98]"
                style={{
                  background: isOOS ? "#e2e8f0" : ACCENT,
                  color: isOOS ? "#94a3b8" : "#fff",
                  boxShadow: isOOS ? "none" : "0 12px 24px rgba(255,2,85,0.24)",
                  cursor: isOOS ? "not-allowed" : undefined,
                }}
              >
                {isOOS ? "Sold Out" : "Buy Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
