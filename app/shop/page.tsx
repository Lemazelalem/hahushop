"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import {
  Search,
  ShoppingCart,
  X,
  Star,
  Zap,
  Heart,
  Grid3X3,
  List,
  TrendingUp,
  Clock,
  ArrowUpDown,
  Eye,
  ChevronDown,
  Menu,
  Camera,
  ArrowLeft,
} from "lucide-react";

const HARDCODED_CATEGORIES = [
  { key: "all",              label: "All"        },
  { key: "phones",           label: "Phones"     },
  { key: "clothes",          label: "Fashion"    },
  { key: "shoes",            label: "Shoes"      },
  { key: "kids_clothes",     label: "Baby & Kids"},
  { key: "home_appliances",  label: "Home"       },
  { key: "wearables",        label: "Electronics"},
  { key: "bags",             label: "Bags"       },
  { key: "toys",             label: "Toys"       },
  { key: "laptops",          label: "Laptops"    },
  { key: "mattress_bedding", label: "Bedding"    },
  { key: "audio",            label: "Audio"      },
  { key: "accessories",      label: "Accessories"},
  { key: "diapers_wipes",    label: "Diapers"    },
];

const M_ACCENT = "#FF0255";

type ProductStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

type ProductRow = {
  id: string;
  status: ProductStatus;
  name: string;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  final_price_cents: number | null;
  price_cents: number | null;
  rating_avg: number;
  rating_count: number;
  category_name: string | null;
  category_id: string | null;
  created_at?: string | null;
};

type Category = {
  id: string;
  name: string;
  slug: string;
};

type FilterState = {
  search: string;
  category: string;
  sortBy: "newest" | "price-low" | "price-high" | "rating";
  viewMode: "grid" | "list";
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest Arrivals", icon: Clock },
  { value: "price-low", label: "Price: Low to High", icon: TrendingUp },
  { value: "price-high", label: "Price: High to Low", icon: TrendingUp },
  { value: "rating", label: "Highest Rated", icon: Star },
] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  shoes: "👟",
  laptops: "💻",
  phones: "📱",
  audio: "🎧",
  bags: "👜",
  accessories: "💍",
  wearables: "⌚",
  toys: "🧸",
  clothes: "👗",
  clothing: "👗",
  kids_clothes: "🧒",
  diapers_wipes: "🍼",
  home_appliances: "🏠",
  mattress_bedding: "🛏️",
  office_furniture: "🪑",
  office_tech: "🖨️",
  stationery: "📝",
  office_supplies: "📎",
  breakroom: "☕",
};

function getCategoryEmoji(slug: string): string {
  const key = slug.toLowerCase().replace(/-/g, "_");
  return CATEGORY_EMOJI[key] ?? "🛒";
}

function money(cents?: number | null): string {
  if (!cents || cents <= 0) return "-";
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyShort(cents?: number | null): string {
  if (!cents || cents <= 0) return "-";
  return `ETB ${(cents / 100).toFixed(0)}`;
}

function formatSoldCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(0)}w+ sold`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k sold`;
  return `${n} sold`;
}

function displayCategoryName(raw: string | null | undefined) {
  const trimmed = (raw || "").trim();
  return trimmed || "General";
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  const safe = Number.isFinite(rating) ? rating : 0;
  const fullStars = Math.floor(safe);
  const hasHalfStar = safe - fullStars >= 0.5;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < fullStars
                ? "fill-amber-400 text-amber-400"
                : i === fullStars && hasHalfStar
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

function TikTokStarRating({ rating }: { rating: number }) {
  const safe = Math.min(Math.max(Number(rating) || 0, 0), 5);
  const fullStars = Math.floor(safe);
  const hasHalfStar = safe - fullStars >= 0.5;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < fullStars
              ? "fill-[#FF0050] text-[#FF0050]"
              : i === fullStars && hasHalfStar
              ? "fill-[#FF0050]/50 text-[#FF0050]"
              : "fill-gray-200 text-gray-200"
          }`}
        />
      ))}
      <span className="text-[10px] text-gray-500 ml-1 font-medium">
        {safe.toFixed(1)}
      </span>
    </div>
  );
}

function DeliveryBadge() {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
      <Zap className="h-3 w-3 fill-emerald-500 text-emerald-500" />
      <span>2-Day Delivery</span>
    </div>
  );
}

function CameraToast({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-2xl shadow-black/30 animate-in slide-in-from-bottom-4 duration-300">
      <Camera className="w-4 h-4 text-blue-400 animate-pulse" />
      <span>Analyzing image…</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-2 text-slate-400 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function MobileSearchBar({
  value,
  onChange,
  onSubmit,
  onImageTap,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onImageTap: () => void;
}) {
  return (
    <div
      role="search"
      style={{
        margin: "0 12px",
        display: "flex",
        alignItems: "center",
        background: "#f8fafc",
        border: "2px solid #111827",
        borderRadius: 14,
        height: 50,
        padding: "4px 4px 4px 14px",
        boxSizing: "border-box",
      }}
    >
      <Search size={18} color="#0f172a" style={{ flexShrink: 0, marginRight: 8 }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search products…"
        aria-label="Search products"
        style={{
          flex: 1,
          outline: "none",
          border: "none",
          background: "transparent",
          fontSize: 16,
          color: "#0f172a",
          fontFamily: "inherit",
          padding: 0,
          minWidth: 0,
        }}
      />
      {value ? (
        <button
          onClick={() => onChange("")}
          aria-label="Clear"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X size={16} color="#6b7280" />
        </button>
      ) : (
        <button
          onClick={onImageTap}
          aria-label="Search by image"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Camera size={18} color="#0f172a" />
        </button>
      )}
      <button
        onClick={onSubmit}
        aria-label="Submit search"
        style={{
          flexShrink: 0,
          background: "#0f172a",
          color: "#fff",
          fontSize: 13,
          fontWeight: 800,
          fontFamily: "inherit",
          padding: "0 14px",
          height: "100%",
          border: "none",
          cursor: "pointer",
          borderRadius: 10,
          whiteSpace: "nowrap",
        }}
      >
        Search
      </button>
    </div>
  );
}

const MobileCategoryRail = React.memo(function MobileCategoryRail({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (c: string) => void;
}) {
  const categories = useMemo(() => HARDCODED_CATEGORIES.map((c) => c.label), []);

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        overflowX: "auto",
        scrollbarWidth: "none",
        borderBottom: "1px solid #f1f5f9",
        padding: "0 12px",
        background: "#f1f5f9",
      }}
    >
      {categories.map((c) => {
        const on = c === active;
        return (
          <button
            key={c}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(c)}
            style={{
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: on ? 800 : 500,
              color: on ? "#111827" : "#9ca3af",
              whiteSpace: "nowrap",
              padding: "10px 10px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              position: "relative",
              letterSpacing: on ? "-0.2px" : "0",
              flexShrink: 0,
            }}
          >
            {c}
            {on && (
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 20,
                  height: 2.5,
                  background: M_ACCENT,
                  borderRadius: 2,
                  display: "block",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
});

function MobileProductImage({
  src,
  alt,
  emoji,
}: {
  src: string | null;
  alt: string;
  emoji: string | null;
}) {
  const [loaded, setLoaded] = useState(false);

  if (!src) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-5xl">
        {emoji ?? "🛍️"}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-100 relative overflow-hidden">
      <div
        className={`absolute inset-0 bg-slate-100 transition-opacity duration-200 ${
          loaded ? "opacity-0" : "opacity-100"
        }`}
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

const MobileFeedCard = React.memo(function MobileFeedCard({
  p,
  qtyInCart,
  isWishlisted,
  onNavigate,
  onToggleWishlist,
}: {
  p: ProductRow;
  qtyInCart: number;
  isWishlisted: boolean;
  onNavigate: (id: string) => void;
  onToggleWishlist: (id: string, e: React.MouseEvent) => void;
}) {
  const price = p.final_price_cents ?? p.price_cents ?? 0;
  const originalPrice = p.price_cents;
  const discount =
    originalPrice && price < originalPrice
      ? Math.round((1 - price / originalPrice) * 100)
      : 0;

  const soldCount =
    p.rating_count > 0
      ? p.rating_count * 12 + Math.floor(Math.random() * 50)
      : Math.floor(Math.random() * 100) + 10;

  return (
    <article
      onClick={() => onNavigate(p.id)}
      className="group bg-white rounded overflow-hidden cursor-pointer flex flex-col"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
    >
      <div className="relative aspect-square bg-slate-100 overflow-hidden">
        <MobileProductImage src={p.image_url} alt={p.name} emoji={p.emoji} />

        {discount > 0 && (
          <div className="absolute top-2 left-2 bg-[#ff0050] text-white text-[10px] font-black px-2 py-1 rounded-md shadow-sm">
            -{discount}%
          </div>
        )}

        {qtyInCart > 0 && (
          <div className="absolute bottom-2 left-2 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            {qtyInCart} in cart
          </div>
        )}

        <button
          type="button"
          onClick={(e) => onToggleWishlist(p.id, e)}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-all ${
            isWishlisted ? "bg-rose-500 text-white" : "bg-white/90 text-slate-500"
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${isWishlisted ? "fill-current" : ""}`} />
        </button>
      </div>

      <div className="p-2.5">
        <h3
          className="text-[13px] leading-[1.3] font-medium text-slate-900 line-clamp-2 min-h-[34px] mb-1.5"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          {p.name}
        </h3>

        <div className="flex items-center justify-between mb-2">
          <TikTokStarRating rating={p.rating_avg} />
          <span className="text-[10px] text-gray-400 font-medium">
            {formatSoldCount(soldCount)}
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex items-baseline gap-1.5">
            <span
              className="text-[15px] leading-none font-bold text-[#FF0050]"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              {moneyShort(price)}
            </span>
            {discount > 0 && originalPrice && (
              <span className="text-[10px] text-gray-400 line-through">
                {moneyShort(originalPrice)}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

function ShopPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cart } = useMiniCart();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());

  const isScrolledRef = useRef(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [cameraToastVisible, setCameraToastVisible] = useState(false);

  const initialCategory = useMemo(() => {
    return (searchParams.get("category") || "").toLowerCase();
  }, [searchParams]);

  const initialSearch = useMemo(() => {
    return searchParams.get("q") || "";
  }, [searchParams]);

  const [filters, setFilters] = useState<FilterState>(() => ({
    search: initialSearch,
    category: initialCategory,
    sortBy: "newest",
    viewMode: "grid",
  }));

  const [mobileCategory, setMobileCategory] = useState<string>(() => {
    if (!initialCategory) return "All";
    const cat = HARDCODED_CATEGORIES.find(
      (c) => c.key === initialCategory || c.key.replace(/_/g, "-") === initialCategory
    );
    return cat?.label ?? "All";
  });

  useEffect(() => {
    const savedWishlist = localStorage.getItem("wishlist");
    if (savedWishlist) setWishlist(new Set(JSON.parse(savedWishlist)));

    const handleScroll = () => {
      const scrolled = window.scrollY > 20;
      if (isScrolledRef.current !== scrolled) {
        isScrolledRef.current = scrolled;
        setIsScrolled(scrolled);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Sync search filter when navigated with ?q= param (e.g. from visual search)
  useEffect(() => {
    if (initialSearch) {
      setFilters((prev) => ({ ...prev, search: initialSearch, category: "" }));
      setMobileCategory("All");
    }
  }, [initialSearch]);

  const approvedQuantities = useMemo(() => {
    const quantities: Record<string, number> = {};
    cart.forEach((item) => {
      if (item.kind === "approved" || item.kind === "approved_public") {
        quantities[item.id] = (quantities[item.id] || 0) + item.quantity;
      }
    });
    return quantities;
  }, [cart]);

  useEffect(() => {
    let alive = true;

    // Restore cached data instantly
    try {
      const cached = localStorage.getItem("hahu-shop-cache");
      if (cached) {
        const c = JSON.parse(cached);
        if (c.categories?.length) setCategories(c.categories);
        if (c.products?.length) { setProducts(c.products); setLoading(false); }
      }
    } catch { /* ignore */ }

    async function load() {
      try {
        setPageError(null);

        const [catRes, prodRes] = await Promise.all([
          supabase
            .from("categories")
            .select("id, name, slug")
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("products")
            .select(`
              id, status, name, description, emoji, image_url,
              final_price_cents, price_cents, rating_avg, rating_count, created_at,
              categories(id, name)
            `)
            .eq("status", "approved")
            .eq("is_active", true)
            .order("created_at", { ascending: false }),
        ]);

        if (!alive) return;

        if (!catRes.error) setCategories(catRes.data || []);

        if (prodRes.error) {
          setPageError(prodRes.error.message || "Could not load products.");
          setProducts([]);
          return;
        }

        const rows = (prodRes.data ?? []).map((row: any) => ({
          id: row.id as string,
          status: (row.status as ProductStatus) ?? "approved",
          name: (row.name as string) ?? "",
          description: (row.description as string | null) ?? null,
          emoji: (row.emoji as string | null) ?? null,
          image_url: (row.image_url as string | null) ?? null,
          final_price_cents: (row.final_price_cents as number | null) ?? null,
          price_cents: (row.price_cents as number | null) ?? null,
          rating_avg: Number(row.rating_avg ?? 0),
          rating_count: Number(row.rating_count ?? 0),
          created_at: (row.created_at as string | null) ?? null,
          category_name: row.categories?.name ?? null,
          category_id: row.categories?.id ?? null,
        }));

        setProducts(rows);

        // Cache for next visit
        try {
          localStorage.setItem("hahu-shop-cache", JSON.stringify({
            categories: catRes.data ?? [],
            products: rows,
            ts: Date.now(),
          }));
        } catch { /* storage full */ }
      } catch (err) {
        console.error("[shop] unexpected error:", err);
        if (!alive) return;
        setPageError("Unexpected error.");
        setProducts([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.category_name ?? "").toLowerCase().includes(q)
      );
    }

    if (filters.category) {
      result = result.filter((p) => p.category_id === filters.category);
    }

    if (mobileCategory !== "All") {
      result = result.filter((p) => {
        const catName = (p.category_name || "").toLowerCase();
        const targetLabel = mobileCategory.toLowerCase();
        const targetKey =
          HARDCODED_CATEGORIES.find((c) => c.label === mobileCategory)?.key || "";

        return (
          catName === targetLabel ||
          catName === targetKey.replace(/_/g, " ") ||
          catName.includes(targetLabel) ||
          (targetKey === "kids_clothes" && catName.includes("kid")) ||
          (targetKey === "diapers_wipes" &&
            (catName.includes("diaper") || catName.includes("wipe"))) ||
          (targetKey === "home_appliances" && catName.includes("appliance")) ||
          (targetKey === "mattress_bedding" &&
            (catName.includes("mattress") || catName.includes("bedding")))
        );
      });
    }

    switch (filters.sortBy) {
      case "price-low":
        result.sort(
          (a, b) =>
            (a.final_price_cents ?? a.price_cents ?? 0) -
            (b.final_price_cents ?? b.price_cents ?? 0)
        );
        break;
      case "price-high":
        result.sort(
          (a, b) =>
            (b.final_price_cents ?? b.price_cents ?? 0) -
            (a.final_price_cents ?? a.price_cents ?? 0)
        );
        break;
      case "rating":
        result.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0));
        break;
      default:
        result.sort((a, b) => {
          const da = a.created_at ? new Date(a.created_at).getTime() : 0;
          const db = b.created_at ? new Date(b.created_at).getTime() : 0;
          return db - da;
        });
    }

    return result;
  }, [products, filters.category, filters.search, mobileCategory, filters.sortBy]);

  const toggleWishlist = useCallback((productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWishlist((prev) => {
      const newWishlist = new Set(prev);
      if (newWishlist.has(productId)) {
        newWishlist.delete(productId);
      } else {
        newWishlist.add(productId);
      }
      localStorage.setItem("wishlist", JSON.stringify([...newWishlist]));
      return newWishlist;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      search: "",
      category: "",
      sortBy: "newest",
      viewMode: "grid",
    });
    setMobileCategory("All");
    router.push("/shop");
  }, [router]);

  const updateCategory = useCallback(
    (categoryId: string) => {
      setFilters((prev) => ({ ...prev, category: categoryId }));
      if (!categoryId) router.push("/shop");
      else router.push(`/shop?category=${encodeURIComponent(categoryId)}`);
    },
    [router]
  );

  const handleMobileCategorySelect = useCallback(
    (label: string) => {
      setMobileCategory(label);
      if (label === "All") {
        router.push("/shop");
      } else {
        const cat = HARDCODED_CATEGORIES.find((c) => c.label === label);
        if (cat) {
          router.push(`/shop?category=${encodeURIComponent(cat.key)}`);
        }
      }
    },
    [router]
  );

  const handleCameraImageSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      setCameraToastVisible(true);

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await fetch("/api/visual-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64 }),
          });
          const data = await res.json();
          setCameraToastVisible(false);

          if (res.ok && data.searchTerm) {
            setFilters((prev) => ({ ...prev, search: data.searchTerm, category: "" }));
            setMobileCategory("All");
          }
        } catch {
          setCameraToastVisible(false);
        }
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const sortedCategories = useMemo(() => {
    const priorityKeys = HARDCODED_CATEGORIES.filter((c) => c.key !== "all").map((c) => c.key);
    const prioritized: Category[] = [];
    const rest: Category[] = [];

    for (const key of priorityKeys) {
      const match = categories.find(
        (c) => c.slug === key || c.slug.replace(/-/g, "_") === key
      );
      if (match) prioritized.push(match);
    }

    for (const cat of categories) {
      if (!prioritized.find((p) => p.id === cat.id)) rest.push(cat);
    }

    return [...prioritized, ...rest];
  }, [categories]);

  const currentCategory = categories.find((c) => c.id === filters.category);

  return (
    <main className="min-h-screen bg-slate-100 md:bg-slate-50">
      <CameraToast
        visible={cameraToastVisible}
        onClose={() => setCameraToastVisible(false)}
      />

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraImageSelected}
      />

      <header
        className={`sticky top-0 z-40 transition-all duration-300 hidden md:block ${
          isScrolled
            ? "bg-white/95 backdrop-blur-xl shadow-lg border-b border-slate-200/80"
            : "bg-white border-b border-slate-200"
        }`}
      >
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-slate-900 hover:text-blue-600 transition-all hover:scale-105"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/25">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <span className="hidden sm:block font-bold text-xl tracking-tight">Shop</span>
            </button>

            <div className="flex-1 relative max-w-2xl group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
              <input
                type="text"
                placeholder="Search products..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                className="w-full pl-12 pr-20 py-3 rounded-2xl bg-slate-100 border-2 border-transparent text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:shadow-lg focus:shadow-blue-500/10 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {filters.search && (
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
                    className="w-6 h-6 bg-slate-300 hover:bg-slate-400 rounded-full flex items-center justify-center text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  title="Search by image"
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  <Camera className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <div className="relative">
                <select
                  value={filters.sortBy}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      sortBy: e.target.value as FilterState["sortBy"],
                    }))
                  }
                  className="appearance-none pl-10 pr-10 py-3 rounded-xl bg-slate-100 border-2 border-transparent text-sm font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 cursor-pointer min-w-[160px]"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="flex bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, viewMode: "grid" }))}
                  className={`p-2.5 rounded-lg transition-all ${
                    filters.viewMode === "grid"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, viewMode: "list" }))}
                  className={`p-2.5 rounded-lg transition-all ${
                    filters.viewMode === "list"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white">
          <div className="max-w-[1600px] mx-auto px-4 py-2.5">
            <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => updateCategory("")}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-bold transition-all whitespace-nowrap ${
                  !filters.category
                    ? "bg-slate-900 text-white border-slate-900 shadow-md"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900"
                }`}
              >
                <Menu className="w-3.5 h-3.5" />
                All
              </button>

              {sortedCategories.map((cat) => {
                const isActive = filters.category === cat.id;
                const emoji = getCategoryEmoji(cat.slug);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => updateCategory(cat.id)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-bold transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-slate-900 text-white border-slate-900 shadow-md"
                        : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50"
                    }`}
                  >
                    <span className="text-sm leading-none">{emoji}</span>
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <header className="md:hidden sticky top-0 z-40 bg-slate-100 border-b border-slate-200">
        <div className="flex items-center justify-between px-3 h-12">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1 text-slate-700"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>

          <span className="text-sm font-bold text-slate-900">Shop</span>

          <button onClick={() => router.push("/checkout")} className="relative p-2">
            <ShoppingCart className="w-5 h-5" />
            {Object.values(approvedQuantities).reduce((a, b) => a + b, 0) > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center"
                style={{ background: M_ACCENT }}
              >
                {Object.values(approvedQuantities).reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
        </div>

        <div style={{ background: "#f1f5f9", borderBottom: "1px solid #e5e7eb", padding: "8px 0" }}>
          <MobileSearchBar
            value={filters.search}
            onChange={(v) => setFilters((prev) => ({ ...prev, search: v }))}
            onSubmit={() => {}}
            onImageTap={() => cameraInputRef.current?.click()}
          />
        </div>

        <MobileCategoryRail active={mobileCategory} onSelect={handleMobileCategorySelect} />
      </header>

      <div className="max-w-[1600px] mx-auto px-0 md:px-6 sm:px-8 lg:px-12 py-4 md:py-8">
        <div className="hidden md:flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 px-0">
          <div>
            <nav className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <button
                onClick={() => router.push("/")}
                className="hover:text-blue-600 transition-colors font-medium"
              >
                Home
              </button>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-900">
                {currentCategory?.name || "All Products"}
              </span>
            </nav>
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                {currentCategory?.name || "All Products"}
              </h1>
              <span className="text-lg font-medium text-slate-500">
                {filteredProducts.length.toLocaleString()} items
              </span>
            </div>
          </div>
        </div>

        {filters.search && (
          <div className="mx-4 md:mx-0 flex items-center gap-3 mb-6 md:mb-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <span className="text-sm text-blue-900">
              Showing results for &quot;<strong>{filters.search}</strong>&quot;
            </span>
            <button
              onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
              className="ml-auto text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
        )}

        {pageError && (
          <div className="mx-4 md:mx-0 mb-8 rounded-2xl p-5 bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
              <X className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold">Error loading products</div>
              <div className="text-xs font-normal text-rose-600">{pageError}</div>
            </div>
          </div>
        )}

        <section>
          {loading ? (
            <>
              <div className="grid grid-cols-2 gap-2 px-2 pt-2 md:hidden bg-[#f5f5f5]">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse bg-white rounded overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                    <div className="aspect-square bg-slate-100 animate-pulse" />
                    <div className="p-2.5">
                      <div className="h-2.5 w-12 bg-slate-100 rounded mb-2 animate-pulse" />
                      <div className="h-3 w-4/5 bg-slate-100 rounded mb-1.5 animate-pulse" />
                      <div className="h-3 w-2/3 bg-slate-100 rounded mb-2 animate-pulse" />
                      <div className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>

              <div
                className={`hidden md:grid gap-4 md:gap-6 ${
                  filters.viewMode === "grid"
                    ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5"
                    : "grid-cols-1"
                }`}
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-3xl p-5 animate-pulse border border-slate-100"
                  >
                    <div className="bg-slate-200 rounded-2xl mb-4 aspect-square" />
                    <div className="h-4 w-3/4 bg-slate-200 rounded-lg mb-3" />
                    <div className="h-3 w-1/2 bg-slate-200 rounded-lg" />
                  </div>
                ))}
              </div>
            </>
          ) : filteredProducts.length === 0 ? (
            <div className="mx-4 md:mx-0 rounded-3xl bg-white border-2 border-dashed border-slate-300 p-12 md:p-20 text-center">
              <div className="w-28 h-28 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-8">
                <Search className="w-12 h-12 text-slate-300" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3">No products found</h3>
              <p className="text-slate-600 mb-8 max-w-md mx-auto">
                We couldn&apos;t find any products matching your search.
              </p>
              <button
                onClick={clearFilters}
                className="px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 px-2 pt-2 md:hidden bg-[#f5f5f5]">
                {filteredProducts.map((p) => {
                  const qtyInCart = approvedQuantities[p.id] ?? 0;
                  const isWishlisted = wishlist.has(p.id);

                  return (
                    <MobileFeedCard
                      key={p.id}
                      p={p}
                      qtyInCart={qtyInCart}
                      isWishlisted={isWishlisted}
                      onNavigate={(id) => router.push(`/shop/${id}`)}
                      onToggleWishlist={toggleWishlist}
                    />
                  );
                })}
              </div>

              <div
                className={`hidden md:grid gap-4 md:gap-6 ${
                  filters.viewMode === "grid"
                    ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5"
                    : "grid-cols-1"
                }`}
              >
                {filteredProducts.map((p) => {
                  const qtyInCart = approvedQuantities[p.id] ?? 0;
                  const price = p.final_price_cents ?? p.price_cents ?? 0;
                  const originalPrice = p.price_cents;
                  const isWishlisted = wishlist.has(p.id);
                  const discount =
                    originalPrice && price < originalPrice
                      ? Math.round((1 - price / originalPrice) * 100)
                      : 0;

                  if (filters.viewMode === "list") {
                    return (
                      <div
                        key={p.id}
                        className="group bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300 flex"
                      >
                        <div
                          onClick={() => router.push(`/shop/${p.id}`)}
                          className="relative w-56 h-56 bg-slate-50 cursor-pointer overflow-hidden flex-shrink-0"
                        >
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-6xl">
                              {p.emoji ?? "🛍️"}
                            </div>
                          )}
                          {discount > 0 && (
                            <div className="absolute top-3 left-3 bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                              {discount}% off
                            </div>
                          )}
                          <button
                            onClick={(e) => toggleWishlist(p.id, e)}
                            className={`absolute top-3 right-3 p-2.5 rounded-full transition-all ${
                              isWishlisted
                                ? "bg-rose-500 text-white"
                                : "bg-white/90 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${isWishlisted ? "fill-current" : ""}`} />
                          </button>
                        </div>
                        <div className="flex-1 p-8 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                                  {displayCategoryName(p.category_name)}
                                </span>
                                <h3
                                  onClick={() => router.push(`/shop/${p.id}`)}
                                  className="text-2xl font-bold text-slate-900 cursor-pointer hover:text-blue-600 transition-colors"
                                >
                                  {p.name}
                                </h3>
                              </div>
                              <div className="flex items-center gap-3">
                                <DeliveryBadge />
                                {qtyInCart > 0 && (
                                  <span className="flex items-center gap-1.5 text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                                    <ShoppingCart className="w-4 h-4" />
                                    {qtyInCart} in cart
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mb-4">
                              <StarRating rating={p.rating_avg} count={p.rating_count} />
                            </div>
                            <p className="text-slate-600 line-clamp-2 mb-4">
                              {p.description || "No description available"}
                            </p>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                            <div>
                              <div className="flex items-baseline gap-3">
                                <span className="text-4xl font-black text-slate-900">
                                  {money(price)}
                                </span>
                                {discount > 0 && originalPrice && (
                                  <span className="text-lg text-slate-400 line-through">
                                    {money(originalPrice)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <button
                                onClick={() => router.push(`/shop/${p.id}`)}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:border-blue-500 hover:text-blue-600 transition-all"
                              >
                                <Eye className="w-4 h-4" />
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <article
                      key={p.id}
                      className="group bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-2xl hover:border-blue-300 transition-all duration-300 flex flex-col"
                    >
                      <div
                        onClick={() => router.push(`/shop/${p.id}`)}
                        className="relative aspect-square bg-slate-50 cursor-pointer overflow-hidden"
                      >
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-6xl group-hover:scale-110 transition-transform">
                            {p.emoji ?? "🛍️"}
                          </div>
                        )}
                        <button
                          onClick={(e) => toggleWishlist(p.id, e)}
                          className={`absolute top-4 right-4 p-3 rounded-full transition-all ${
                            isWishlisted
                              ? "bg-rose-500 text-white shadow-lg"
                              : "bg-white/95 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          <Heart className={`w-5 h-5 ${isWishlisted ? "fill-current" : ""}`} />
                        </button>
                        {qtyInCart > 0 && (
                          <div className="absolute top-4 left-4 bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-full shadow-lg flex items-center gap-1.5">
                            <ShoppingCart className="w-3.5 h-3.5" />
                            {qtyInCart}
                          </div>
                        )}
                        {discount > 0 && (
                          <div className="absolute bottom-4 left-4 bg-rose-500 text-white text-xs font-bold px-3 py-2 rounded-full">
                            {discount}% OFF
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/shop/${p.id}`);
                          }}
                          className="absolute bottom-4 right-4 p-3 bg-white/95 text-slate-700 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full truncate">
                            {displayCategoryName(p.category_name)}
                          </span>
                          <DeliveryBadge />
                        </div>
                        <h3
                          onClick={() => router.push(`/shop/${p.id}`)}
                          className="font-bold text-slate-900 leading-snug mb-3 line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors min-h-[2.75rem]"
                        >
                          {p.name}
                        </h3>
                        <div className="mb-4">
                          <StarRating rating={p.rating_avg} count={p.rating_count} />
                        </div>
                        <div className="mt-auto flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="text-lg font-black text-slate-900">
                              {money(price)}
                            </span>
                            {discount > 0 && originalPrice && (
                              <span className="text-xs text-slate-400 line-through">
                                {money(originalPrice)}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => router.push(`/shop/${p.id}`)}
                            className="text-slate-700 text-sm font-bold px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="hidden sm:inline">View</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <div className="h-20" />
      </div>
    </main>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={null}>
      <ShopPageContent />
    </Suspense>
  );
}
