"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import { flyToCart } from "@/lib/flyToCart";
import { ShoppingCart, Check, Minus, Plus } from "lucide-react";

type ProductStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

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
  size_variants: SizeVariant[] | null;
};

function getProductStock(stockQty: number | null, sizeVariants: SizeVariant[] | null): number | null {
  if (sizeVariants && sizeVariants.length > 0) {
    return sizeVariants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
  }
  return stockQty;
}

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
  size?: "sm" | "md";
}) {
  const isInteractive = !!onChange;
  const starClass =
    size === "sm"
      ? "text-[14px] leading-none"
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
              isInteractive ? "hover:-translate-y-[1px] active:scale-95" : "",
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

  const [ratingStats, setRatingStats] = useState<RatingStats>({
    avg: 0,
    count: 0,
    myRating: null,
  });
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

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

    async function load() {
      setLoading(true);
      setPageError(null);

      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id ?? null;
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
            size_variants,
            category:categories(name)
          `
          )
          .eq("id", productIdForLoad)
          .eq("status", "approved")
          .eq("is_active", true)
          .maybeSingle();

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

        setProduct(normalizedProduct);
        await loadRatings(productIdForLoad, uid);
      } catch (err) {
        console.error("Unexpected error loading product detail:", err);
        setPageError("Unexpected error while loading product.");
      } finally {
        setLoading(false);
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

        setRatingStats({
          avg,
          count,
          myRating,
        });
      } finally {
        setRatingLoading(false);
      }
    }

    load();
  }, [currentProductId]);

  const displayPrice = useMemo(() => {
    if (!product) return "-";
    if (product.final_price_cents && product.final_price_cents > 0) {
      return money(product.final_price_cents);
    }
    return money(product.price_cents ?? product.seller_price_cents);
  }, [product]);

  const unitPriceCents = useMemo(() => {
    if (!product) return 0;
    if (product.final_price_cents && product.final_price_cents > 0) {
      return product.final_price_cents;
    }
    return product.price_cents ?? product.seller_price_cents ?? 0;
  }, [product]);

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

  const stock = product ? getProductStock(product.stock_quantity, product.size_variants) : null;
  const isOOS = stock !== null && stock <= 0;

  function handleAddToCart(e?: MouseEvent<HTMLButtonElement>) {
    if (!product || isOOS) return;
    addItem("approved", product.id, selectedQty);
    flyToCart({ sourceEl: e?.currentTarget, imageUrl: product.image_url });
    showAddedState();
  }

  function handleShopNow(e?: MouseEvent<HTMLButtonElement>) {
    if (!product || isOOS) return;
    addItem("approved", product.id, selectedQty);
    flyToCart({ sourceEl: e?.currentTarget, imageUrl: product.image_url });
    showAddedState();
    router.push("/checkout");
  }

  async function handleRate(newValue: number) {
    if (!product || !product.id) return;

    if (!userId) {
      setPageError("You must be signed in to rate this product.");
      return;
    }

    const safeValue = clampRating(newValue);

    try {
      setRatingSaving(true);
      setPageError(null);

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
        setPageError(error.message || "Could not save rating.");
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
    } catch (err) {
      console.error("Unexpected rating error:", err);
      setPageError("Unexpected error while saving rating.");
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
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-4">
              {pageError}
            </div>
          )}
        </div>

        <div className="overflow-hidden md:bg-white md:rounded-2xl md:shadow-sm md:border md:border-slate-200">
          {loading || !product ? (
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
          ) : (
            <div className="grid md:grid-cols-2 gap-0">
              <div className="pb-4 md:p-8 md:bg-slate-50">
                <div className="aspect-square overflow-hidden flex items-center justify-center bg-white md:rounded-2xl md:border md:border-slate-200">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <div className="text-6xl mb-2">{product.emoji || "\u{1F6CD}\uFE0F"}</div>
                      <div className="text-sm">No image available</div>
                    </div>
                  )}
                </div>

                {product.extra_image_urls && product.extra_image_urls.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-600 mb-2">
                      Gallery
                    </div>
                    <div className="flex gap-2 overflow-x-auto">
                      {product.extra_image_urls.map((url, idx) => (
                        <div
                          key={idx}
                          className="h-16 w-16 rounded-lg border border-slate-200 overflow-hidden flex-shrink-0"
                        >
                          <img
                            src={url}
                            alt={`Extra ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
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
                </div>

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

                <div className="border-t border-slate-100 pt-6">
                  <h3 className="text-[13px] md:text-sm font-bold text-slate-900 mb-3">
                    Rate this product
                  </h3>

                  {userId ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[13px] md:text-sm text-slate-600">Your rating:</span>
                      <StarsRow
                        value={ratingStats.myRating || 0}
                        onChange={handleRate}
                        size="md"
                      />
                      {ratingSaving && (
                        <span className="text-xs text-slate-500">Saving...</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px] md:text-sm text-slate-500">
                      Sign in to rate this product.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
