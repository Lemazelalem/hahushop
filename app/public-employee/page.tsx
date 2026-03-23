"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import { flyToCart } from "@/lib/flyToCart";
import {
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Star,
  Package,
  AlertCircle,
  Check,
  TrendingDown,
  Users,
  Truck,
  ShieldCheck,
  Clock,
  XCircle,
  Upload,
  MessageSquare,
  Camera,
  Search,
  ChevronRight,
  Eye,
  X,
  Briefcase,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════════
   COLOR TOKENS
══════════════════════════════════════════════════════════════════════════════ */

const ACCENT = "#FF0046";
const PE_LABEL_COLOR = "#1ea001";
const M_ACCENT = "#FF0255";

/* ══════════════════════════════════════════════════════════════════════════════
   HARDCODED CATEGORIES (matching HomePage)
══════════════════════════════════════════════════════════════════════════════ */

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

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════════ */

type ProductStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "archived";

type CategoryShape = { name: string };

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  status: ProductStatus;
  price_cents: number | null;
  final_price_cents: number | null;
  public_employee_price_cents: number | null;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  color_variants: unknown[] | null;
  size_variants: unknown[] | null;
  categories?: CategoryShape | CategoryShape[] | null;
};

type PEAccessState =
  | "checking"
  | "signed_out"
  | "approved"
  | "pending"
  | "rejected"
  | "not_submitted";

type PEDocInfo = {
  status: PEAccessState;
  reviewer_notes: string | null;
  admin_notes: string | null;
  discount_percent: number | null;
  doc_id: string | null;
  submitted_at: string | null;
};

type Toast = { id: string; msg: string; type: "info" | "success" | "error" };

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */

function money(cents?: number | null): string | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null;
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyShort(cents?: number | null): string | null {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return null;
  return `ETB ${(cents / 100).toFixed(0)}`;
}

function calculateSavings(
  regularCents?: number | null,
  employeeCents?: number | null
) {
  if (!regularCents || !employeeCents || regularCents <= 0 || employeeCents <= 0)
    return null;

  const savings = regularCents - employeeCents;
  if (savings <= 0) return null;

  return {
    amount: savings,
    percent: Math.round((savings / regularCents) * 100),
  };
}

function discPct(r?: number | null, p?: number | null): number | null {
  if (!r || !p || r <= 0 || p <= 0) return null;
  const pct = Math.round((1 - p / r) * 100);
  return pct > 0 ? pct : null;
}

function itemQty(item: { qty?: number; quantity?: number }): number {
  const val = item.qty ?? item.quantity ?? 0;
  return typeof val === 'number' && !isNaN(val) ? val : 0;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getCategoryNames(value?: CategoryShape | CategoryShape[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((c) => c.name).filter(Boolean);
  return value.name ? [value.name] : [];
}

function hasVariants(p: ProductRow): boolean {
  return (p.color_variants?.length ?? 0) > 0 || (p.size_variants?.length ?? 0) > 0;
}

function getPublicEmployeeQuantities(
  cart: Array<{ id: string; kind?: string; qty?: number; quantity?: number }>
): Record<string, number> {
  const q: Record<string, number> = {};
  cart.forEach((item) => {
    if (item.kind === "approved_public") {
      q[item.id] = (q[item.id] || 0) + itemQty(item);
    }
  });
  return q;
}

function matchesCategory(p: ProductRow, cat: string): boolean {
  if (cat === "All") return true;
  const names = getCategoryNames(p.categories);
  return names.includes(cat);
}

/* ══════════════════════════════════════════════════════════════════════════════
   HOOKS
══════════════════════════════════════════════════════════════════════════════ */

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const show = useCallback((msg: string, type: Toast["type"] = "info") => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setToasts((prev) => [...prev, { id, msg, type }]);

    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2400);

    timersRef.current.push(timer);
  }, []);

  return { toasts, show };
}

/* ══════════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
══════════════════════════════════════════════════════════════════════════════ */

function ToastStack({
  toasts,
  position = "top-center",
}: {
  toasts: Toast[];
  position?: "top-center" | "top-right";
}) {
  if (!toasts.length) return null;

  const positionStyles =
    position === "top-right"
      ? "fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
      : "absolute top-10 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1.5 w-[90%] pointer-events-none";

  return (
    <div className={positionStyles}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "px-4 py-2.5 rounded-lg shadow-xl text-sm font-semibold text-white text-center",
            t.type === "success" && "bg-emerald-600",
            t.type === "error" && "bg-rose-600",
            t.type === "info" && "bg-slate-900"
          )}
          style={{ animation: "fadeSlide 0.2s ease" }}
        >
          {t.msg}
        </div>
      ))}
      <style>{`@keyframes fadeSlide{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

/* ── FIXED: Renamed from Clock to StarIcon to avoid naming conflict ── */
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <Star
      className={cx(
        "w-3.5 h-3.5",
        filled ? "fill-amber-400 text-amber-400" : "text-slate-200"
      )}
    />
  );
}

function Stars({ value }: { value: number }) {
  const rating = Number.isFinite(value) ? value : 0;
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((s) => (
        <StarIcon key={s} filled={rating >= s} />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   DESKTOP COMPONENTS (UNCHANGED)
══════════════════════════════════════════════════════════════════════════════ */

function DesktopCategoryFilter({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Filter by category">
      {categories.map((c) => {
        const isActive = c === active;
        return (
          <button
            key={c}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(c)}
            className={cx(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
              isActive
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900"
            )}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function DesktopSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search public employee deals..."
        aria-label="Search deals"
        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}

function VerificationBanner({
  docInfo,
  onApply,
  onReupload,
}: {
  docInfo: PEDocInfo;
  onApply: () => void;
  onReupload: () => void;
}) {
  const { status, reviewer_notes, submitted_at } = docInfo;

  if (status === "checking") {
    return (
      <div className="rounded-2xl bg-slate-100 border border-slate-200 px-5 py-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-200 rounded w-48" />
            <div className="h-3 bg-slate-200 rounded w-64" />
          </div>
        </div>
      </div>
    );
  }

  if (status === "signed_out") {
    return (
      <div className="rounded-2xl bg-blue-50 border border-blue-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-blue-900 text-base">
              Sign in to unlock public employee pricing
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              Browse everything freely. You&apos;ll be asked to verify when you try to shop.
            </p>
            <button
              onClick={onApply}
              className="mt-3 w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Sign in or verify
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-emerald-900 text-base">
              ✅ You&apos;re verified — special pricing is active
            </h3>
            <p className="text-sm text-emerald-700 mt-0.5">
              You can open product details and buy with employee pricing now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <h3 className="font-bold text-amber-900 text-base">
              ⏳ Verification under review
            </h3>
            <p className="text-sm text-amber-700 mt-1">
              You can keep browsing. We&apos;ll unlock shopping once your verification is approved.
            </p>
            {submitted_at && (
              <p className="text-xs text-amber-600 mt-1">
                Submitted{" "}
                {new Date(submitted_at).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 px-5 py-5">
        <div className="flex items-start gap-3">
          <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-rose-900 text-base">
              ❌ Verification was not approved
            </h3>
            <p className="text-sm text-rose-700 mt-1">
              You can still browse, but you&apos;ll need to reapply before purchasing.
            </p>
            {reviewer_notes && (
              <div className="mt-3 rounded-xl bg-white border border-rose-200 px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <MessageSquare className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
                    Message from our team
                  </span>
                </div>
                <p className="text-sm text-slate-800 font-medium leading-relaxed">
                  &ldquo;{reviewer_notes}&rdquo;
                </p>
              </div>
            )}
            <button
              onClick={onReupload}
              className="mt-4 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-rose-500/25 active:scale-95"
            >
              <Upload className="w-4 h-4" />
              Re-upload &amp; reapply
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-bold text-amber-900 text-base">
            Browse now, verify when you shop
          </h3>
          <p className="text-sm text-amber-700 mt-1">
            Product details and checkout access will ask for sign-in and verification.
          </p>
          <button
            onClick={onApply}
            className="mt-3 w-full sm:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Start verification →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── NEW: Product Image with Error Handling ── */
function ProductImage({ 
  src, 
  emoji, 
  alt,
  className = "",
  style = {}
}: { 
  src: string | null; 
  emoji: string | null; 
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [error, setError] = useState(false);
  
  if (!src || error) {
    return (
      <div 
        className={cx("flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50", className)}
        style={style}
        aria-label={alt}
      >
        <span className="text-4xl">{emoji ?? "📦"}</span>
      </div>
    );
  }
  
  return (
    <img 
      src={src} 
      alt={alt}
      onError={() => setError(true)}
      className={cx("object-cover", className)}
      style={style}
      loading="lazy"
    />
  );
}

function DesktopProductCard({
  p,
  qtyInCart,
  isAdded,
  canShop,
  onAddToCart,
  onNavigate,
}: {
  p: ProductRow;
  qtyInCart: number;
  isAdded: boolean;
  canShop: boolean;
  onAddToCart: (sourceEl?: HTMLElement | null) => void;
  onNavigate: () => void;
}) {
  const baseCents = p.price_cents ?? p.final_price_cents;
  const savings = calculateSavings(baseCents, p.public_employee_price_cents);
  const regularPrice = money(baseCents);
  const employeePrice = money(p.public_employee_price_cents);
  const reviews = p.rating_count ?? 0;
  const variants = hasVariants(p);

  return (
    <div className="group relative bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:shadow-slate-900/5 hover:border-slate-300 transition-all duration-300 flex flex-col">
      {savings && savings.percent > 0 && (
        <div
          className="absolute top-2 left-2 z-10 text-white text-xs font-bold px-2 py-0.5 rounded-md shadow-sm"
          style={{ background: ACCENT }}
        >
          -{savings.percent}%
        </div>
      )}

      {qtyInCart > 0 && (
        <div className="absolute top-2 right-2 z-10 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
          <ShoppingCart className="w-3 h-3" />
          {qtyInCart}
        </div>
      )}

      <div
        className="aspect-square relative overflow-hidden cursor-pointer bg-gradient-to-br from-slate-100 to-slate-50"
        onClick={onNavigate}
      >
        <ProductImage
          src={p.image_url}
          emoji={p.emoji}
          alt={p.name}
          className="w-full h-full group-hover:scale-105 transition-transform duration-500"
        />

        {!canShop && (
          <div className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm">
            Verify to shop
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <h3
          className="text-sm font-bold text-slate-900 leading-snug mb-1.5 line-clamp-2 cursor-pointer group-hover:text-blue-600 transition-colors"
          onClick={onNavigate}
          title={p.name}
        >
          {p.name}
        </h3>

        {reviews > 0 ? (
          <div className="flex items-center gap-1.5 mb-2.5">
            <Stars value={Number(p.rating_avg ?? 0)} />
            <span className="text-xs text-slate-400">({reviews})</span>
          </div>
        ) : (
          <div className="h-5 mb-2.5" />
        )}

        <div className="mt-auto bg-slate-50 rounded-xl p-3 space-y-2">
          {regularPrice && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Regular</span>
              <span className="text-xs text-slate-400 line-through">
                {regularPrice}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Employee price
            </span>
            <span className="text-base font-bold text-slate-900">
              {employeePrice ?? "—"}
            </span>
          </div>

          {savings && savings.amount > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                You save
              </span>
              <span className="text-sm font-bold text-emerald-700">
                {money(savings.amount)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-blue-900 bg-blue-50 px-3 py-2 rounded-lg">
          <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="font-medium">24h delivery</span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            onClick={onNavigate}
            className="w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            <Eye className="w-3.5 h-3.5" />
            View Deal
          </button>

          <button
            onClick={(e) => onAddToCart(e.currentTarget)}
            disabled={isAdded}
            className={cx(
              "w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
              isAdded ? "bg-emerald-500 text-white" : "text-white active:scale-95"
            )}
            style={!isAdded ? { background: ACCENT } : undefined}
          >
            {isAdded ? (
              <>
                <Check className="w-3.5 h-3.5" /> Added
              </>
            ) : canShop ? (
              variants ? (
                <>
                  <ArrowRight className="w-3.5 h-3.5" /> Options
                </>
              ) : (
                <>
                  <ShoppingCart className="w-3.5 h-3.5" /> Add
                </>
              )
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" /> Verify
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MOBILE COMPONENTS
══════════════════════════════════════════════════════════════════════════════ */

/* ── NEW: Business conflict wall shown on mobile when user is a Business account ── */
function MobileBusinessConflictWall({ onBack }: { onBack: () => void }) {
  const router = useRouter();

  return (
    <main className="md:hidden flex flex-col min-h-screen bg-[#f5f5f5]">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-3 h-12">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-slate-700"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Shop</span>
          </button>
          <span
            className="text-[13px] font-black tracking-tight text-slate-900"
          >
            Public Employee
          </span>
          {/* spacer to keep title centered */}
          <div className="w-14" />
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div
          className="bg-white rounded-3xl border border-slate-200 p-7 w-full max-w-xs text-center"
          style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.07)" }}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-blue-600" />
          </div>

          <h2
            className="text-[16px] font-black text-slate-900 mb-2 tracking-tight"
          >
            Business Account Active
          </h2>

          <p className="text-[12px] text-slate-500 leading-relaxed mb-5">
            Public Employee deals are a different program and can't be combined with a business account. Please switch to another account to access.
          </p>

          <button
            onClick={() => router.push("/business")}
            className="w-full py-3 rounded-2xl text-[13px] font-bold text-white mb-2.5 active:scale-[0.98] transition-all"
            style={{ background: "#0f172a" }}
          >
            Go to Business Dashboard
          </button>

          <button
            onClick={() => router.push("/shop")}
            className="w-full py-3 rounded-2xl text-[13px] font-medium text-slate-700 border border-slate-200 active:scale-[0.98] transition-all"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    </main>
  );
}

function MobileWavyArrow() {
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <path
        d="M1 6 C2.5 3.5, 4 8.5, 5.5 6 S8.5 3.5, 10 6"
        stroke="#84cc16"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9.5 4.5 L11.5 6 L9.5 7.5"
        stroke="#84cc16"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MobileCategoryRail({
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
        background: "#fff",
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
        background: "#fff",
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

/* ── NEW: Mobile verification banner matching desktop design ── */
function MobileVerificationBanner({
  docInfo,
  onApply,
  onReupload,
}: {
  docInfo: PEDocInfo;
  onApply: () => void;
  onReupload: () => void;
}) {
  const { status, reviewer_notes, submitted_at } = docInfo;

  if (status === "checking") {
    return (
      <div
        className="mx-2 mt-2 rounded-xl px-4 py-3 animate-pulse"
        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-slate-200 rounded w-40" />
            <div className="h-2.5 bg-slate-200 rounded w-52" />
          </div>
        </div>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <div
        className="mx-2 mt-2 rounded-xl px-4 py-3"
        style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "#22c55e" }}
          >
            <Check className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p
              className="text-[13px] font-black"
              style={{ color: "#14532d" }}
            >
              ✅ Verified — employee pricing active
            </p>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: "#16a34a" }}
            >
              You can view details and add items to cart.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "signed_out") {
    return (
      <div
        className="mx-2 mt-2 rounded-xl px-4 py-3"
        style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe" }}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#2563eb" }} />
          <div className="flex-1">
            <p className="text-[13px] font-black" style={{ color: "#1e3a8a" }}>
              Sign in to unlock employee pricing
            </p>
            <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: "#3b82f6" }}>
              Browse freely. Verify when you&apos;re ready to shop.
            </p>
            <button
              onClick={onApply}
              className="px-4 py-2 rounded-lg text-white text-[11px] font-bold"
              style={{ background: "#2563eb" }}
            >
              Sign in or verify
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div
        className="mx-2 mt-2 rounded-xl px-4 py-3"
        style={{ background: "#fffbeb", border: "1.5px solid #fde68a" }}
      >
        <div className="flex items-start gap-3">
          <Clock
            className="w-5 h-5 mt-0.5 shrink-0 animate-pulse"
            style={{ color: "#d97706" }}
          />
          <div>
            <p className="text-[13px] font-black" style={{ color: "#78350f" }}>
              ⏳ Verification under review
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#b45309" }}>
              Keep browsing. Shopping unlocks once approved.
            </p>
            {submitted_at && (
              <p className="text-[10px] mt-1" style={{ color: "#d97706" }}>
                Submitted{" "}
                {new Date(submitted_at).toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div
        className="mx-2 mt-2 rounded-xl px-4 py-3.5"
        style={{ background: "#fff1f2", border: "1.5px solid #fecdd3" }}
      >
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#e11d48" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black" style={{ color: "#881337" }}>
              ❌ Verification not approved
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#e11d48" }}>
              You can browse, but you need to reapply before purchasing.
            </p>
            {reviewer_notes && (
              <div
                className="mt-2.5 rounded-lg px-3 py-2"
                style={{ background: "#fff", border: "1px solid #fecdd3" }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: "#e11d48" }} />
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider"
                    style={{ color: "#e11d48" }}
                  >
                    Message from our team
                  </span>
                </div>
                <p
                  className="text-[11px] font-medium leading-relaxed"
                  style={{ color: "#1e293b" }}
                >
                  &ldquo;{reviewer_notes}&rdquo;
                </p>
              </div>
            )}
            <button
              onClick={onReupload}
              className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[11px] font-bold"
              style={{ background: "#e11d48" }}
            >
              <Upload className="w-3.5 h-3.5" />
              Re-upload &amp; reapply
            </button>
          </div>
        </div>
      </div>
    );
  }

  // not_submitted
  return (
    <div
      className="mx-2 mt-2 rounded-xl px-4 py-3"
      style={{ background: "#fffbeb", border: "1.5px solid #fde68a" }}
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "#d97706" }} />
        <div className="flex-1">
          <p className="text-[13px] font-black" style={{ color: "#78350f" }}>
            Browse now, verify when you shop
          </p>
          <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: "#b45309" }}>
            Product details and cart access will ask for verification.
          </p>
          <button
            onClick={onApply}
            className="px-4 py-2 rounded-lg text-white text-[11px] font-bold"
            style={{ background: "#d97706" }}
          >
            Start verification →
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileSlimStrip({
  docInfo,
  onApply,
  onReupload,
}: {
  docInfo: PEDocInfo;
  onApply: () => void;
  onReupload: () => void;
}) {
  const { status } = docInfo;
  if (status === "approved" || status === "checking") return null;

  const configs: Record<string, { msg: string; btn: string | null }> = {
    signed_out: {
      msg: "Sign in to unlock employee shopping",
      btn: "Sign in",
    },
    pending: {
      msg: "⏳ Verification pending · browse now, shop after approval",
      btn: null,
    },
    rejected: {
      msg: "❌ Verification not approved",
      btn: "Reapply",
    },
    not_submitted: {
      msg: "🎖️ Browse deals now · verify when you try to buy",
      btn: "Verify →",
    },
  };

  const cfg = configs[status];
  if (!cfg) return null;

  return (
    <div
      role="alert"
      className="mx-3 mt-2 flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: "#fff7ed", border: "1.5px solid #fed7aa" }}
    >
      <span
        className="flex-1 text-[10px] font-semibold"
        style={{ color: "#c2410c", fontFamily: "inherit" }}
      >
        {cfg.msg}
      </span>
      {cfg.btn && (
        <button
          onClick={status === "rejected" ? onReupload : onApply}
          className="px-2.5 py-1 rounded-md text-[10px] font-bold text-white border-none cursor-pointer shrink-0"
          style={{ background: ACCENT, fontFamily: "inherit" }}
        >
          {cfg.btn}
        </button>
      )}
    </div>
  );
}

function MobileProductCard({
  p,
  inCart,
  canShop,
  onAdd,
  onNavigate,
}: {
  p: ProductRow;
  inCart: number;
  canShop: boolean;
  onAdd: (sourceEl?: HTMLElement | null) => void;
  onNavigate: () => void;
}) {
  const baseCents = p.price_cents ?? p.final_price_cents;
  const d = discPct(baseCents, p.public_employee_price_cents);
  const variants = hasVariants(p);

  return (
    <div
      className="bg-white rounded overflow-hidden flex flex-col"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
    >
      <div
        onClick={onNavigate}
        className="relative cursor-pointer"
        style={{
          paddingBottom: "133%",
          background: "linear-gradient(145deg,#f8fafc,#e2e8f0)",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <ProductImage
            src={p.image_url}
            emoji={p.emoji}
            alt={p.name}
            className="w-full h-full"
            style={{ objectFit: "contain" }}
          />
        </div>

        {d && d > 0 && (
          <div
            className="absolute top-2 left-2 text-white text-[8px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: ACCENT }}
          >
            -{d}%
          </div>
        )}

        {!canShop && (
          <div className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-1 text-[9px] font-bold text-slate-700 shadow-sm">
            Verify to shop
          </div>
        )}

        {inCart > 0 && (
          <div
            aria-hidden="true"
            className="absolute bottom-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: ACCENT }}
          >
            {inCart}
          </div>
        )}
      </div>

      <div className="p-2 flex flex-col">
        <div
          onClick={onNavigate}
          title={p.name}
          className="text-[11px] font-medium text-slate-900 mb-1 truncate cursor-pointer"
          style={{ lineHeight: 1.3, fontFamily: "inherit" }}
        >
          {p.name}
        </div>

        {p.rating_count > 0 && (
          <div
            className="text-[9px] text-slate-400 mb-1"
            style={{ fontFamily: "inherit" }}
          >
            {p.rating_count} reviews
          </div>
        )}

        {d && d > 0 && (
          <div className="flex items-center gap-1 mb-1">
            <MobileWavyArrow />
            <span
              className="text-[10px] font-semibold"
              style={{ color: "#84cc16", fontFamily: "inherit" }}
            >
              {d}% off
            </span>
          </div>
        )}

        <div className="mb-1">
          <div
            className="text-[17px] font-bold tracking-tight"
            style={{
              color: "#000",
              lineHeight: 1,
              fontFamily: "inherit",
            }}
          >
            {moneyShort(p.public_employee_price_cents)}
          </div>
          <div
            className="text-[10px] text-slate-400 line-through mt-0.5"
            style={{ fontFamily: "inherit" }}
          >
            {moneyShort(baseCents)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 mt-1">
          <button
            onClick={onNavigate}
            className="w-full py-2 rounded-md text-[10px] font-bold border border-slate-200 text-slate-700 bg-white"
            style={{ fontFamily: "inherit" }}
          >
            View
          </button>

          <button
            onClick={(e) => onAdd(e.currentTarget)}
            aria-label={
              inCart > 0
                ? `Added, ${inCart} in cart`
                : canShop
                ? variants
                  ? "Select options"
                  : `Add ${p.name} to cart`
                : "Verify to shop"
            }
            className="w-full py-2 rounded-md text-[10px] font-bold flex items-center justify-center gap-1"
            style={{
              background: inCart > 0 ? "#16a34a" : ACCENT,
              color: "#fff",
              fontFamily: "inherit",
            }}
          >
            {inCart > 0 ? (
              <>✓ Added</>
            ) : canShop ? (
              variants ? (
                <>
                  Options <ChevronRight className="w-3 h-3" />
                </>
              ) : (
                <>Add</>
              )
            ) : (
              <>Verify</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */

export default function PublicEmployeePage() {
  const router = useRouter();
  const { cart, addItem } = useMiniCart();
  const toast = useToast();

  const mountedRef = useRef(true);
  const timeoutRef = useRef<number[]>([]);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [fabBounce, setFabBounce] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  // ── NEW: tracks whether the signed-in user is a Business account ──
  const [isBusinessConflict, setIsBusinessConflict] = useState(false);

  const [docInfo, setDocInfo] = useState<PEDocInfo>({
    status: "checking",
    reviewer_notes: null,
    admin_notes: null,
    discount_percent: null,
    doc_id: null,
    submitted_at: null,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timeoutRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const peQuantities = useMemo(
    () =>
      getPublicEmployeeQuantities(
        cart as Array<{ id: string; kind?: string; qty?: number; quantity?: number }>
      ),
    [cart]
  );

  const peItemCount = useMemo(
    () =>
      (cart as Array<{ kind?: string; qty?: number; quantity?: number }>).reduce(
        (sum, item) =>
          item.kind === "approved_public" ? sum + itemQty(item) : sum,
        0
      ),
    [cart]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((p) => {
      const matchCat = category === "All" || matchesCategory(p, category);
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q);

      return matchCat && matchSearch;
    });
  }, [products, category, search]);

  const maxPercentOff = useMemo(() => {
    let max = 0;
    for (const p of products) {
      const pct = discPct(
        p.price_cents ?? p.final_price_cents,
        p.public_employee_price_cents
      );
      if (pct && pct > max) max = pct;
    }
    return max;
  }, [products]);

  const canShop = docInfo.status === "approved";

  function goPublicEmployeeSignup(productId?: string, redirectPath?: string) {
    const qs = new URLSearchParams();
    if (productId) qs.set("product_id", productId);
    if (redirectPath) qs.set("redirect", redirectPath);
    else qs.set("redirect", "/public-employee");
    router.push(`/public-employee/signup?${qs.toString()}`);
  }

  function goReupload() {
    const qs = new URLSearchParams();
    qs.set("redirect", "/public-employee");
    qs.set("step", "upload");
    router.push(`/public-employee/signup?${qs.toString()}`);
  }

  const handleOpenProduct = useCallback(
    (p: ProductRow) => {
      if (canShop) {
        router.push(`/products/${p.id}`);
        return;
      }
      goPublicEmployeeSignup(p.id, `/products/${p.id}`);
    },
    [canShop, router]
  );

  const handleAddToCart = useCallback(
    (p: ProductRow, sourceEl?: HTMLElement | null) => {
      if (!canShop) {
        goPublicEmployeeSignup(p.id, `/products/${p.id}`);
        return;
      }

      if (hasVariants(p)) {
        router.push(`/products/${p.id}`);
        return;
      }

      addItem("approved_public", p.id, 1, {
        overridePriceCents: p.public_employee_price_cents,
      });
      flyToCart({ sourceEl, imageUrl: p.image_url });

      setFabBounce(true);

      const bounceTimer = window.setTimeout(() => {
        if (mountedRef.current) setFabBounce(false);
      }, 400);
      timeoutRef.current.push(bounceTimer);

      setAddedIds((prev) => new Set([...prev, p.id]));
      toast.show(`✓ ${p.name} added to cart`, "success");

      const addedTimer = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setAddedIds((prev) => {
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        });
      }, 1200);

      timeoutRef.current.push(addedTimer);
    },
    [canShop, addItem, router, toast]
  );

  /* ── Auth + doc status ─────────────────────────────────────────────────── */

  useEffect(() => {
    let alive = true;

    async function checkAccess() {
      try {
        setDocInfo((prev) => ({ ...prev, status: "checking" }));

        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (!alive) return;

        if (authErr || !auth?.user) {
          setDocInfo((prev) => ({ ...prev, status: "signed_out" }));
          return;
        }

        // ── NEW: check if this user is a Business account ──
        const { data: profileData } = await supabase
          .from("profiles")
          .select("is_business_account")
          .eq("id", auth.user.id)
          .maybeSingle();

        if (!alive) return;

        if (profileData?.is_business_account === true) {
          setIsBusinessConflict(true);
          // Set a neutral doc status so the desktop banner doesn't show
          // anything misleading — desktop is unchanged so this doesn't matter
          // visually, but keeps state clean.
          setDocInfo((prev) => ({ ...prev, status: "not_submitted" }));
          return;
        }
        // ── end conflict check ──

        const { data: docs, error: docsErr } = await supabase
          .from("public_employee_documents")
          .select(
            "id, status, reviewer_notes, admin_notes, discount_percent, created_at"
          )
          .eq("user_id", auth.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!alive) return;

        if (docsErr || !docs) {
          setDocInfo((prev) => ({ ...prev, status: "not_submitted" }));
          return;
        }

        const raw = String(docs.status ?? "").toLowerCase();
        const mappedStatus: PEAccessState =
          raw === "approved"
            ? "approved"
            : raw === "rejected"
            ? "rejected"
            : raw === "pending"
            ? "pending"
            : "not_submitted";

        setDocInfo({
          status: mappedStatus,
          reviewer_notes: docs.reviewer_notes ?? null,
          admin_notes: docs.admin_notes ?? null,
          discount_percent: docs.discount_percent ?? null,
          doc_id: docs.id ?? null,
          submitted_at: docs.created_at ?? null,
        });
      } catch {
        if (!alive) return;
        setDocInfo((prev) => ({ ...prev, status: "not_submitted" }));
      }
    }

    checkAccess();

    return () => {
      alive = false;
    };
  }, []);

  /* ── Load products ─────────────────────────────────────────────────────── */

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setPageError(null);

        const { data, error } = await supabase
          .from("products")
          .select(
            `id, name, description, emoji, image_url, status,
             price_cents, final_price_cents, public_employee_price_cents,
             rating_avg, rating_count, created_at,
             color_variants, size_variants, categories(name)`
          )
          .eq("status", "approved")
          .eq("is_active", true)
          .gt("public_employee_price_cents", 0)
          .order("created_at", { ascending: false });

        if (!alive) return;
        if (error) throw error;

        setProducts((data ?? []) as ProductRow[]);
      } catch (e: unknown) {
        if (!alive) return;

        const message =
          e && typeof e === "object" && "message" in e
            ? String((e as { message?: string }).message)
            : "Failed to load public employee deals.";

        setPageError(message);
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

  /* ════════════════════════════════════════════════════════════════════════
     DESKTOP (UNCHANGED)
  ════════════════════════════════════════════════════════════════════════ */

  return (
    <>
      <main className="hidden md:block min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <ToastStack toasts={toast.toasts} position="top-right" />

        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => router.push("/shop")}
                className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition-colors p-2 hover:bg-slate-100 rounded-lg"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back to Shop</span>
              </button>
              <div className="h-5 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-slate-900 leading-tight">
                    Public Employee Deals
                  </h1>
                  <p className="text-xs text-slate-500">
                    Browse now, verify when you shop
                  </p>
                </div>
              </div>
            </div>

            <DesktopSearchBar value={search} onChange={setSearch} />

            <button
              onClick={() => router.push("/checkout")}
              className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-slate-900/20"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Cart</span>
              <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-xs min-w-[1.25rem] text-center">
                {peItemCount}
              </span>
            </button>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {pageError && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 flex items-center gap-3 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {pageError}
            </div>
          )}

          <VerificationBanner
            docInfo={docInfo}
            onApply={() => goPublicEmployeeSignup()}
            onReupload={goReupload}
          />

          <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6 text-white">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold mb-3">
                <BadgePercent className="w-3.5 h-3.5" />
                Public Employee Benefits
              </div>
              <h2 className="text-3xl font-black tracking-tight">
                Real shopping, exclusive pricing
              </h2>
              <p className="mt-2 text-sm text-white/75">
                Browse all eligible products, open details, compare savings, and verify when you're ready to purchase.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-emerald-400/15 text-emerald-200 px-3 py-1.5 rounded-full text-xs font-semibold">
                  <Truck className="w-3.5 h-3.5" />
                  Fast delivery
                </span>
                {maxPercentOff > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-rose-400/15 text-rose-200 px-3 py-1.5 rounded-full text-xs font-semibold">
                    <BadgePercent className="w-3.5 h-3.5" />
                    Up to {maxPercentOff}% off
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 bg-blue-400/15 text-blue-200 px-3 py-1.5 rounded-full text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Government-only pricing
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Exclusive Deals
                </h2>
                <p className="text-sm text-slate-500">
                  {loading ? (
                    "Loading…"
                  ) : (
                    <>
                      <span className="font-semibold text-slate-900">
                        {filteredProducts.length}
                      </span>
                      {filteredProducts.length !== products.length
                        ? ` of ${products.length}`
                        : ""}{" "}
                      products with employee pricing
                    </>
                  )}
                </p>
              </div>
            </div>

            {!loading && (
              <DesktopCategoryFilter
                categories={HARDCODED_CATEGORIES.map((c) => c.label)}
                active={category}
                onSelect={setCategory}
              />
            )}
          </div>

          {peItemCount > 0 && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-blue-800">
                <ShoppingCart className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-medium">
                  {peItemCount} employee deal{peItemCount !== 1 ? "s" : ""} in
                  your cart
                </span>
              </div>
              <button
                onClick={() => router.push("/checkout")}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                Checkout <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse bg-white rounded-2xl p-3 border border-slate-200"
                >
                  <div className="aspect-square bg-slate-200 rounded-xl mb-3" />
                  <div className="h-3 bg-slate-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-1/2 mb-4" />
                  <div className="h-16 bg-slate-100 rounded-xl mb-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-9 bg-slate-200 rounded-xl" />
                    <div className="h-9 bg-slate-200 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200">
              <Package className="w-14 h-14 text-slate-200 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-slate-900 mb-2">
                {search || category !== "All"
                  ? "No matching products"
                  : "No deals available"}
              </h3>
              <p className="text-sm text-slate-500">
                {search || category !== "All"
                  ? "Try a different search or category."
                  : "Check back later for new public employee offers."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {filteredProducts.map((p) => (
                <DesktopProductCard
                  key={p.id}
                  p={p}
                  qtyInCart={peQuantities[p.id] ?? 0}
                  isAdded={addedIds.has(p.id)}
                  canShop={canShop}
                  onAddToCart={(sourceEl) => handleAddToCart(p, sourceEl)}
                  onNavigate={() => handleOpenProduct(p)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── MOBILE ── */}
      {isBusinessConflict ? (
        <MobileBusinessConflictWall onBack={() => router.push("/shop")} />
      ) : (
        <main className="md:hidden flex flex-col min-h-screen bg-[#f5f5f5] relative overflow-hidden">
          <ToastStack toasts={toast.toasts} position="top-center" />

          <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
            <div className="flex items-center justify-between px-3 h-12">
              <button
                onClick={() => router.push("/shop")}
                className="flex items-center gap-1 text-slate-700"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Shop</span>
              </button>

              {/* Center: Title + Status Badge (Amazon-style under title) */}
              <div className="flex flex-col items-center">
                <span className="text-[13px] font-black tracking-tight text-slate-900">
                  Employee Deals
                </span>
                
                {/* Status badge under title - matching Header.tsx account dropdown style */}
                <div className="flex items-center gap-1 mt-0.5">
                  {docInfo.status === "approved" ? (
                    <>
                      <span className="text-[9px] uppercase tracking-wider font-bold text-cyan-600">
                        CUSTOMER
                      </span>
                      <span className="text-[9px] uppercase tracking-wider font-black" style={{ color: PE_LABEL_COLOR }}>
                        · PUBLIC EMPLOYEE
                      </span>
                    </>
                  ) : docInfo.status === "pending" ? (
                    <span className="text-[9px] uppercase tracking-wider font-bold text-amber-600">
                      VERIFICATION PENDING
                    </span>
                  ) : docInfo.status === "rejected" ? (
                    <span className="text-[9px] uppercase tracking-wider font-bold text-rose-600">
                      VERIFICATION REJECTED
                    </span>
                  ) : docInfo.status === "signed_out" ? (
                    <span className="text-[9px] uppercase tracking-wider font-bold text-blue-600">
                      SIGN IN TO SHOP
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">
                      BROWSE DEALS
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => router.push("/checkout")}
                data-cart-target="true"
                className="relative p-2"
              >
                <ShoppingCart className="w-5 h-5" />
                {peItemCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center"
                    style={{ background: ACCENT }}
                  >
                    {peItemCount}
                  </span>
                )}
              </button>
            </div>

            <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "8px 0" }}>
              <MobileSearchBar
                value={search}
                onChange={setSearch}
                onSubmit={() => {
                  if (!search.trim()) {
                    router.push("/shop");
                    return;
                  }
                  router.push(`/shop?q=${encodeURIComponent(search.trim())}`);
                }}
                onImageTap={() =>
                  toast.show("Image search is not available yet.", "info")
                }
              />
            </div>

            <MobileCategoryRail
              active={category}
              onSelect={setCategory}
            />
          </header>

          {pageError && (
            <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {pageError}
            </div>
          )}

          <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-24 px-2 pt-2">
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse bg-white rounded overflow-hidden"
                  >
                    <div
                      className="bg-slate-200"
                      style={{ paddingBottom: "133%" }}
                    />
                    <div className="p-2 space-y-2">
                      <div className="h-2.5 bg-slate-200 rounded w-4/5" />
                      <div className="h-2 bg-slate-200 rounded w-3/5" />
                      <div className="h-5 bg-slate-200 rounded" />
                      <div className="grid grid-cols-2 gap-1">
                        <div className="h-7 bg-slate-200 rounded" />
                        <div className="h-7 bg-slate-200 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div
                role="status"
                className="text-center py-12 text-slate-400 text-sm"
              >
                {search || category !== "All"
                  ? "No matching products"
                  : "No deals available"}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredProducts.map((p) => (
                  <MobileProductCard
                    key={p.id}
                    p={p}
                    inCart={peQuantities[p.id] ?? 0}
                    canShop={canShop}
                    onAdd={(sourceEl) => handleAddToCart(p, sourceEl)}
                    onNavigate={() => handleOpenProduct(p)}
                  />
                ))}
              </div>
            )}
          </div>

          {peItemCount > 0 && (
            <div className="fixed bottom-6 right-3 z-50">
              <button
                aria-label={`View cart, ${peItemCount} employee item${
                  peItemCount !== 1 ? "s" : ""
                }`}
                onClick={() => router.push("/checkout")}
                className="relative flex items-center justify-center rounded-full"
                style={{
                  width: 52,
                  height: 52,
                  background: ACCENT,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: `0 4px 20px ${ACCENT}66`,
                  transform: fabBounce ? "scale(1.22)" : "scale(1)",
                  transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                <ShoppingCart className="w-5 h-5 text-white" strokeWidth={2} />
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black text-white flex items-center justify-center text-[9px] font-bold"
                >
                  {peItemCount}
                </span>
              </button>
            </div>
          )}
        </main>
      )}
    </>
  );
}