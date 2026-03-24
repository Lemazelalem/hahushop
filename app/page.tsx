"use client";

import { Suspense, useEffect, useState, useMemo, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sora } from "next/font/google";
import { supabase } from "@/lib/supabaseClient";
import { useMiniCart } from "@/components/MiniCartProvider";
import {
  ShoppingCart,
  Star,
  ChevronRight,
  Menu,
  ArrowRight,
  Sparkles,
  Grid,
  Search,
  Camera,
  X,
  Tag,
  User,
  Play,
  Heart,
  ShieldCheck,
  Truck,
  WalletCards,
  Gift,
  CheckCircle2,
  Lock,
} from "lucide-react";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════════ */

type HeroSlide = {
  id: string;
  title: string;
  tagline: string | null;
  image_url: string | null;
  link_url: string | null;
};

type ApprovedProduct = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  final_price_cents: number | null;
  original_price_cents?: number | null;
  rating_avg: number;
  rating_count: number;
  category: string;
  created_at?: string;
};

type Category = {
  id: string;
  name: string;
  slug: string;
};

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════════════════ */

const HARDCODED_CATEGORIES = [
  { key: "all", label: "All" },
  { key: "kids_clothes", label: "Kids Clothes" },
  { key: "diapers_wipes", label: "Diapers & Wipes" },
  { key: "shoes", label: "Shoes" },
  { key: "laptops", label: "Laptops" },
  { key: "phones", label: "Phones" },
  { key: "home_appliances", label: "Home Appliances" },
  { key: "toys", label: "Toys" },
  { key: "mattress_bedding", label: "Mattress & Bedding" },
  { key: "clothes", label: "Clothes" },
  { key: "audio", label: "Audio" },
  { key: "bags", label: "Bags" },
  { key: "accessories", label: "Accessories" },
  { key: "wearables", label: "Wearables" },
];

const PRODUCT_FIELDS = `
  id, name, description, emoji, image_url,
  final_price_cents, price_cents,
  rating_avg, rating_count,
  categories(name), created_at
`;

const M_ACCENT = "#FF0255";
const WELCOME_HERO_IMAGE = "/images/welcome-hero.jpg";

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */

function money(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "ETB 0.00";
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyShort(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return "—";
  return `ETB ${(cents / 100).toFixed(0)}`;
}

function discountPct(
  orig: number | null | undefined,
  price: number | null | undefined
): number {
  if (!orig || !price || price >= orig) return 0;
  return Math.round((1 - price / orig) * 100);
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function mapProduct(p: any): ApprovedProduct {
  const categoryName = Array.isArray(p.categories)
    ? p.categories[0]?.name
    : p.categories?.name;

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    emoji: p.emoji,
    image_url: p.image_url,
    final_price_cents: p.final_price_cents,
    original_price_cents: p.price_cents,
    rating_avg: Number(p.rating_avg ?? 0),
    rating_count: Number(p.rating_count ?? 0),
    category: categoryName || "General",
    created_at: p.created_at,
  };
}

function deduped(products: ApprovedProduct[], seen: Set<string>): ApprovedProduct[] {
  const result = products.filter((p) => !seen.has(p.id));
  result.forEach((p) => seen.add(p.id));
  return result;
}

/* ══════════════════════════════════════════════════════════════════════════════
   MOBILE HOOKS
══════════════════════════════════════════════════════════════════════════════ */

function useMToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const show = useCallback((msg: string, type = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, msg, type }]);
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 2200);
    timers.current.push(t);
  }, []);

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout);
  }, []);

  return { toasts, show };
}

function useMSlider(length: number, ms = 4200) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % length), ms);
    return () => clearInterval(t);
  }, [length, ms]);

  return [idx, setIdx] as const;
}

/* ══════════════════════════════════════════════════════════════════════════════
   MOBILE COMPONENTS
══════════════════════════════════════════════════════════════════════════════ */

function MToastStack({ toasts }: { toasts: { id: number; msg: string; type: string }[] }) {
  if (!toasts.length) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 58,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: "90%",
        pointerEvents: "none",
      }}
    >
      <style>{`@keyframes mfs{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            textAlign: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            background:
              t.type === "success" ? "#16a34a" : t.type === "error" ? "#dc2626" : "#0f172a",
            boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
            animation: "mfs 0.2s ease",
          }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function MHeader({
  cartTotal,
  onCartTap,
  onLogoTap,
  onAccountTap,
}: {
  cartTotal: number;
  onCartTap: () => void;
  onLogoTap: () => void;
  onAccountTap: () => void;
}) {
  return (
    <header
      style={{
        background: "rgba(255,255,255,0.3)",
        backdropFilter: "blur(25px) saturate(180%)",
        WebkitBackdropFilter: "blur(25px) saturate(180%)",
        borderBottom: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          minHeight: 52,
        }}
      >
        <button
          onClick={onLogoTap}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.6px",
              fontFamily: "inherit",
              lineHeight: 1,
              background: "linear-gradient(90deg,#A3E635,#38BDF8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            HahuShop
          </span>

          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: "#6b7280",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontFamily: "inherit",
              lineHeight: 1,
            }}
          >
            ETHIOPIA ኢትዮጵያ
          </span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={onAccountTap}
            aria-label="Account"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0f172a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>

          <button
            onClick={onCartTap}
            aria-label={`Cart, ${cartTotal} items`}
            style={{
              position: "relative",
              padding: 6,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            <ShoppingCart size={20} color="#0f172a" />
            {cartTotal > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -1,
                  right: -1,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: M_ACCENT,
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {cartTotal > 99 ? "99+" : cartTotal}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function MSearchBar({
  value,
  onChange,
  onSubmit,
  onImageTap,
  selectedImage,
  onClearImage,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onImageTap: () => void;
  selectedImage: string | null;
  onClearImage: () => void;
}) {
  return (
    <div
      role="search"
      style={{
        margin: "0 12px",
        display: "flex",
        alignItems: "center",
        background: "transparent",
        border: "2px solid #111827",
        borderRadius: 14,
        height: 50,
        padding: "4px 4px 4px 14px",
        boxSizing: "border-box",
        width: "calc(100% - 24px)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Search size={18} color="#0f172a" style={{ flexShrink: 0, marginRight: 8 }} />
      {selectedImage ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <img
            src={selectedImage}
            alt="Selected for search"
            style={{
              height: 32,
              width: 32,
              objectFit: "cover",
              borderRadius: 4,
              border: "1px solid #e5e7eb",
            }}
          />
          <span
            style={{
              fontSize: 14,
              color: "#6b7280",
              fontFamily: "inherit",
              flex: 1,
            }}
          >
            Image selected
          </span>
        </div>
      ) : (
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
      )}
      {value || selectedImage ? (
        <button
          onClick={() => {
            onChange("");
            onClearImage();
          }}
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

function MCategoryRail({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
}) {
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

function MHero({
  slides,
  idx,
  setIdx,
  onShopNow,
}: {
  slides: HeroSlide[];
  idx: number;
  setIdx: (i: number) => void;
  onShopNow: (link?: string | null) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (!slides.length) return null;

  const fallbackBg = [
    "linear-gradient(145deg,#0f172a 0%,#1e3a8a 100%)",
    "linear-gradient(145deg,#1a0505 0%,#7f1d1d 100%)",
    "linear-gradient(145deg,#0f172a 0%,#312e81 100%)",
  ][idx % 3];

  const slide = slides[idx];

  return (
    <div
      style={{
        margin: "8px 12px 0",
        borderRadius: 16,
        overflow: "hidden",
        position: "relative",
        height: 190,
        cursor: "pointer",
      }}
      onClick={() => onShopNow(slide.link_url)}
    >
      {slide.image_url && !imgFailed ? (
        <img
          src={slide.image_url}
          alt={slide.title ?? ""}
          onError={() => setImgFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: fallbackBg }} />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.055) 1px,transparent 1px)",
          backgroundSize: "20px 20px",
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg,transparent 30%,rgba(0,0,0,0.52) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(255,255,255,0.16)",
              backdropFilter: "blur(8px)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              padding: "4px 8px",
              borderRadius: 999,
              marginBottom: 8,
            }}
          >
            <Play size={10} /> Trending
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.08,
              letterSpacing: "-0.6px",
              maxWidth: "70%",
            }}
          >
            {slide.title}
          </div>
          {slide.tagline && (
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.82)",
                marginTop: 6,
                maxWidth: "80%",
              }}
            >
              {slide.tagline}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShopNow(slide.link_url);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#fff",
              color: "#0f172a",
              fontSize: 12,
              fontWeight: 800,
              padding: "10px 14px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
            }}
          >
            Shop now <ArrowRight size={13} />
          </button>

          <div style={{ display: "flex", gap: 6 }}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx(i);
                }}
                style={{
                  width: i === idx ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.45)",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function MSectionHeader({
  title,
  subtitle,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  onSeeAll: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        padding: "12px 14px 10px",
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.3px" }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 10.5, color: "#9ca3af", marginTop: 1 }}>{subtitle}</div>}
      </div>
      <button
        onClick={onSeeAll}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          background: "none",
          border: "none",
          fontSize: 11,
          fontWeight: 800,
          color: M_ACCENT,
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
        }}
      >
        See all <ChevronRight size={13} color={M_ACCENT} />
      </button>
    </div>
  );
}

function MShelfCard({ p, onOpen }: { p: ApprovedProduct; onOpen: () => void }) {
  const disc = discountPct(p.original_price_cents, p.final_price_cents);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      onClick={onOpen}
      style={{
        flexShrink: 0,
        width: 150,
        background: "#fff",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #ebebeb",
        cursor: "pointer",
      }}
    >
      <div style={{ position: "relative", paddingBottom: "90%", background: "#f5f5f5" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {p.image_url && !imgFailed ? (
            <img 
              src={p.image_url} 
              alt={p.name} 
              loading="lazy"
              onError={() => setImgFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} 
            />
          ) : (
            <span style={{ fontSize: 32 }} aria-hidden="true">
              {p.emoji ?? "📦"}
            </span>
          )}
        </div>

        {disc > 0 && (
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              background: M_ACCENT,
              color: "#fff",
              fontSize: 8.5,
              fontWeight: 700,
              padding: "2px 5px",
              borderRadius: 4,
            }}
          >
            -{disc}%
          </div>
        )}
      </div>

      <div style={{ padding: "7px 9px 10px" }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            color: "#1f1f1f",
            lineHeight: 1.4,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            marginBottom: 4,
            minHeight: 32,
          }}
        >
          {p.name}
        </div>

        {p.rating_count > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
            <div style={{ display: "flex", gap: 1 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <svg
                  key={i}
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill={i <= Math.round(p.rating_avg) ? "#ffc107" : "#e5e7eb"}
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
            <span style={{ fontSize: 10, color: "#888" }}>{p.rating_avg.toFixed(1)}</span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>
            {moneyShort(p.final_price_cents)}
          </span>
          {disc > 0 && (
            <span style={{ fontSize: 9.5, color: "#bbb", textDecoration: "line-through" }}>
              {moneyShort(p.original_price_cents)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MShelf({
  title,
  subtitle,
  products,
  onOpen,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  products: ApprovedProduct[];
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}) {
  if (!products.length) return null;

  return (
    <div style={{ marginTop: 16, background: "#fff", paddingBottom: 12 }}>
      <MSectionHeader title={title} subtitle={subtitle} onSeeAll={onSeeAll} />
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            gap: 9,
            overflowX: "auto",
            padding: "0 14px 2px",
            scrollbarWidth: "none",
          }}
        >
          {products.map((p) => (
            <MShelfCard key={p.id} p={p} onOpen={() => onOpen(p.id)} />
          ))}
          <div style={{ flexShrink: 0, width: 20 }} />
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 40,
            background: "linear-gradient(to left,#fff,transparent)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

function MProductCard({ p, onOpen }: { p: ApprovedProduct; onOpen: () => void }) {
  const disc = discountPct(p.original_price_cents, p.final_price_cents);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div onClick={onOpen} style={{ background: "#fff", cursor: "pointer", position: "relative" }}>
      <div style={{ position: "relative", paddingBottom: "100%", background: "#f0f0f0" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {p.image_url && !imgFailed ? (
            <img
              src={p.image_url}
              alt={p.name}
              onError={() => setImgFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="lazy"
            />
          ) : (
            <span style={{ fontSize: 42 }} aria-hidden="true">
              {p.emoji ?? "📦"}
            </span>
          )}
        </div>

        {disc > 0 && (
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              background: M_ACCENT,
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            -{disc}%
          </div>
        )}

        <button
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.88)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ccc"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      <div style={{ padding: "7px 8px 9px", background: "#fff" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#1f1f1f",
            lineHeight: 1.4,
            marginBottom: 4,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {p.name}
        </div>

        {p.rating_count > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
            <div style={{ display: "flex", gap: 1 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <svg
                  key={i}
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill={i <= Math.round(p.rating_avg) ? "#ffc107" : "#e5e7eb"}
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
            <span style={{ fontSize: 10, color: "#888" }}>{p.rating_avg.toFixed(1)}</span>
            <span style={{ fontSize: 10, color: "#bbb" }}>| {formatCount(p.rating_count)} sold</span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
            {moneyShort(p.final_price_cents)}
          </span>
          {disc > 0 && (
            <span style={{ fontSize: 10, color: "#bbb", textDecoration: "line-through" }}>
              {moneyShort(p.original_price_cents)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MFAB({ count }: { count: number }) {
  const router = useRouter();
  if (count === 0) return null;

  return (
    <div style={{ position: "absolute", bottom: 74, right: 12 }}>
      <button
        onClick={() => router.push("/checkout")}
        aria-label={`View cart, ${count} items`}
        style={{
          width: 54,
          height: 54,
          borderRadius: "50%",
          background: M_ACCENT,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 10px 24px ${M_ACCENT}55`,
          position: "relative",
        }}
      >
        <ShoppingCart size={22} color="#fff" />
        <span
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#000",
            color: "#fff",
            fontSize: 9,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {count > 99 ? "99+" : count}
        </span>
      </button>
    </div>
  );
}

function MGridSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: "1px solid #ebebeb" }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          style={{
            borderRight: i % 2 === 0 ? "1px solid #ebebeb" : "none",
            borderBottom: "1px solid #ebebeb",
            background: "#fff",
          }}
        >
          <div style={{ paddingBottom: "100%", background: "#f5f5f5" }} />
          <div style={{ padding: "8px 10px" }}>
            <div style={{ height: 10, background: "#f5f5f5", borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 10, background: "#f5f5f5", borderRadius: 4, width: "60%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const PROMO_ANIM_STYLES = `
@keyframes promoSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes promoSlideLeft {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes promoZoomPop {
  0%   { opacity: 0; transform: scale(0.7); }
  70%  { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes promoBlurIn {
  from { opacity: 0; filter: blur(8px); }
  to   { opacity: 1; filter: blur(0); }
}
@keyframes promoFlip {
  0%   { opacity: 0; transform: rotateX(90deg); }
  60%  { opacity: 1; transform: rotateX(-10deg); }
  100% { opacity: 1; transform: rotateX(0deg); }
}
@keyframes promoTypewriter {
  from { opacity: 0; clip-path: inset(0 100% 0 0); }
  to   { opacity: 1; clip-path: inset(0 0 0 0); }
}
@keyframes promoPulseGlow {
  0%, 100% { box-shadow: 0 0 0px rgba(255,255,255,0); }
  50%      { box-shadow: 0 0 14px rgba(255,255,255,0.25); }
}
`;

const PROMO_BANNERS = [
  { emoji: "🎁", text: "First-order bonus expires in:", gradient: "linear-gradient(90deg, #FF0255, #ff6b6b)", anim: "promoSlideUp 0.5s ease-out" },
  { emoji: "🚚", text: "Free delivery on orders above ETB 4500", gradient: "linear-gradient(90deg, #0891B2, #38BDF8)", anim: "promoSlideLeft 0.5s ease-out" },
  { emoji: "🔥", text: "Flash sale, 15% off glassware", gradient: "linear-gradient(90deg, #EA580C, #FACC15)", anim: "promoZoomPop 0.5s ease-out" },
  { emoji: "⭐", text: "Double loyalty points today", gradient: "linear-gradient(90deg, #7C3AED, #C084FC)", anim: "promoBlurIn 0.5s ease-out" },
  { emoji: "💎", text: "Buy 2 get 1 free on selected items", gradient: "linear-gradient(90deg, #059669, #34D399)", anim: "promoFlip 0.6s ease-out" },
  { emoji: "🏷️", text: "New here? 10% off first order", gradient: "linear-gradient(90deg, #D926AA, #F472B6)", anim: "promoTypewriter 0.6s ease-out" },
];

function FirstOrderBonusBanner({ compact = false }: { compact?: boolean }) {
  const [remainingSeconds, setRemainingSeconds] = useState(24 * 60 * 60 - 1);
  const [promoIdx, setPromoIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const seconds = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
      setRemainingSeconds(seconds);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const cycle = setInterval(() => {
      setPromoIdx((i) => (i + 1) % PROMO_BANNERS.length);
      setAnimKey((k) => k + 1);
    }, 5000);
    return () => clearInterval(cycle);
  }, []);

  const hh = String(Math.floor(remainingSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remainingSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(remainingSeconds % 60).padStart(2, "0");
  const promo = PROMO_BANNERS[promoIdx];

  return (
    <>
      <style>{PROMO_ANIM_STYLES}</style>
      <div
        style={{
          background: promo.gradient,
          padding: compact ? "10px 12px" : "12px 16px",
          borderRadius: 12,
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          transition: "background 0.5s ease",
          animation: "promoPulseGlow 2.5s ease-in-out infinite",
          overflow: "hidden",
        }}
      >
        <span
          key={animKey}
          style={{
            color: "#fff",
            fontSize: compact ? 11 : 12,
            fontWeight: 700,
            lineHeight: 1.25,
            animation: promo.anim,
            animationFillMode: "both",
          }}
        >
          {promo.emoji} {promo.text}
        </span>
        <span
          style={{
            color: "#fff",
            fontSize: compact ? 13 : 14,
            fontWeight: 900,
            fontFamily: "monospace",
            whiteSpace: "nowrap",
          }}
        >
          {hh}:{mm}:{ss}
        </span>
      </div>
    </>
  );
}

function MobileAuthSheet({
  open,
  onClose,
  userInitial,
  userName,
  userEmail,
  userRole,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  userInitial: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  onLogout: () => Promise<void>;
}) {
  const router = useRouter();
  const isLoggedIn = !!userInitial;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 49,
            background: "rgba(15,23,42,0.18)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            transition: "opacity 200ms ease",
          }}
        />
      )}

      <div
        onTouchStart={(e) => {
          (e.currentTarget as any)._touchX = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const startX = (e.currentTarget as any)._touchX ?? 0;
          const diff = e.changedTouches[0].clientX - startX;
          if (diff > 60) onClose();
        }}
        style={{
          position: "fixed",
          top: 52,
          right: 0,
          width: "60%",
          maxWidth: 280,
          bottom: 0,
          zIndex: 50,
          background:
            "linear-gradient(155deg, rgba(236,253,245,0.88) 0%, rgba(209,250,229,0.82) 38%, rgba(186,230,253,0.78) 100%)",
          backdropFilter: "blur(22px) saturate(165%)",
          WebkitBackdropFilter: "blur(22px) saturate(165%)",
          borderLeft: "1px solid rgba(255,255,255,0.45)",
          boxShadow: "-12px 0 38px rgba(16,185,129,0.16)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms cubic-bezier(0.32,0.72,0,1)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "20px 20px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
          {isLoggedIn ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                  background: "linear-gradient(135deg,#2563eb,#4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 18, fontWeight: 900,
                }}>
                  {userInitial}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userEmail}</div>
                </div>
              </div>

              {userRole === "admin" && (
                <button
                  onClick={() => {
                    onClose();
                    router.push("/admin");
                  }}
                  style={btnStyle("#f8fafc", "#0f172a")}
                >
                  Admin Dashboard
                </button>
              )}

              {userRole === "seller" && (
                <button
                  onClick={() => {
                    onClose();
                    router.push("/seller");
                  }}
                  style={btnStyle("#f8fafc", "#0f172a")}
                >
                  Seller Dashboard
                </button>
              )}

              <button onClick={() => { onClose(); router.push("/account"); }} style={btnStyle("#0f172a", "#fff")}>My Account</button>
              <button onClick={() => { onClose(); router.push("/my-orders"); }} style={btnStyle("#f8fafc", "#0f172a")}>My Orders</button>
              {(userRole === "customer" || !userRole) && (
                <button
                  onClick={() => {
                    onClose();
                    router.push("/auth/signup?redirect=%2Fseller");
                  }}
                  style={btnStyle("#ecfdf5", "#059669")}
                >
                  Start Selling
                </button>
              )}
              <button onClick={() => { onClose(); router.push("/checkout"); }} style={btnStyle("#f8fafc", "#0f172a")}>Cart</button>

              <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />

              <button
                onClick={async () => { await onLogout(); onClose(); }}
                style={{ ...btnStyle("#fff5f5", "#ef4444"), color: "#ef4444", marginTop: 4 }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 4 }}>Welcome 👋</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Log in to track orders and more.</div>
              <button onClick={() => { onClose(); router.push("/auth/login"); }} style={btnStyle("#0f172a", "#fff")}>Log in</button>
              <button onClick={() => { onClose(); router.push("/auth/signup"); }} style={btnStyle("#fff", "#0f172a")}>Create account</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    width: "100%", 
    padding: "11px 4px", 
    borderRadius: 0, 
    fontSize: 13,
    fontWeight: 700, 
    cursor: "pointer", 
    textAlign: "left",
    background: bg,
    color: color,
    border: "none",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    fontFamily: "inherit",
    WebkitTapHighlightColor: "transparent",
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   SINGLE-SCREEN WELCOME MODAL (Immediate Browsing Model)
══════════════════════════════════════════════════════════════════════════════ */

function ValueProp({
  icon,
  text,
  sub,
  compact,
}: {
  icon: ReactNode;
  text: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: compact ? 8 : 12,
      padding: compact ? "8px 10px" : "10px 14px", borderRadius: 10,
      background:"rgba(255,255,255,0.05)",
      border:"1px solid rgba(255,255,255,0.08)",
    }}>
      {icon}
      <div>
        <div style={{ fontSize: compact ? 11 : 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", lineHeight: 1.3 }}>{text}</div>
        {sub && !compact && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function WelcomeCountdown() {
  const [remaining, setRemaining] = useState(0);
  const [promoIdx, setPromoIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      setRemaining(Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cycle = setInterval(() => {
      setPromoIdx((i) => (i + 1) % PROMO_BANNERS.length);
      setAnimKey((k) => k + 1);
    }, 4000);
    return () => clearInterval(cycle);
  }, []);

  const hh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const promo = PROMO_BANNERS[promoIdx];

  return (
    <>
      <style>{PROMO_ANIM_STYLES}</style>
      <p
        key={animKey}
        style={{
          margin: "6px 0 0",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(255,255,255,0.62)",
          animation: promo.anim,
          animationFillMode: "both",
        }}
      >
        {promo.emoji} {promo.text}{" "}
        <span style={{ fontFamily: "monospace", fontWeight: 900, color: "#86EFAC" }}>
          {hh}:{mm}:{ss}
        </span>
      </p>
    </>
  );
}

function WelcomeModal({
  open,
  onStartShopping,
  onCreateAccount,
  onLogin,
}: {
  open: boolean;
  onStartShopping: () => void;
  onCreateAccount: () => void;
  onLogin: () => void;
}) {
  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "#050A14",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <style>{`
        @keyframes wmShimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes wmFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wmFadeUp2 {
          0%, 28%  { opacity: 0; transform: translateY(14px); }
          100%     { opacity: 1; transform: translateY(0); }
        }
        @keyframes wmFadeUp3 {
          0%, 48%  { opacity: 0; transform: translateY(14px); }
          100%     { opacity: 1; transform: translateY(0); }
        }
        @keyframes wmPanelUp {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatBadge {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }
        @keyframes wmBtnPulse {
          0%, 100% { box-shadow: 0 8px 28px rgba(163,230,53,0.35); transform: scale(1); }
          50%       { box-shadow: 0 12px 36px rgba(163,230,53,0.58); transform: scale(1.025); }
        }
        .wm-primary:active { transform: scale(0.97) !important; }
        .wm-secondary:active { filter: brightness(0.88); }
      `}</style>

      {/* ── HERO PHOTO (top ~57%) ── */}
      <div style={{ position: "relative", height: "57%", flexShrink: 0, overflow: "hidden" }}>
        <img
          src={WELCOME_HERO_IMAGE}
          alt="Happy shopper"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
        />

        {/* Gradient overlays */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(5,10,20,0.72) 0%, rgba(5,10,20,0.15) 38%, transparent 58%, rgba(5,10,20,0.6) 80%, rgba(5,10,20,0.97) 100%)",
        }} />
        {/* Subtle cool color grade */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(56,189,248,0.08) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        {/* Logo pill — top center */}
        <div style={{
          position: "absolute", top: 36, left: 0, right: 0,
          display: "flex", justifyContent: "center",
          animation: "wmFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 14px 6px 8px",
            background: "rgba(5,10,20,0.55)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.15)", borderRadius: 999,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "linear-gradient(145deg, #A3E635, #38BDF8)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ShoppingCart size={15} color="#050A14" strokeWidth={2.2} />
            </div>
            <span style={{
              fontSize: 18, fontWeight: 900, letterSpacing: "-0.8px",
              background: "linear-gradient(90deg,#fff 0%,#CBD5E1 60%,#fff 100%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: "wmShimmer 4s linear infinite",
            }}>
              HahuShop
            </span>
          </div>
        </div>

        {/* Floating deal badges */}
        <div style={{
          position: "absolute", top: 36, right: 16,
          animation: "floatBadge 3s ease-in-out infinite 0.5s",
        }}>
          <div style={{
            background: "rgba(255,255,255,0.13)", backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.22)", borderRadius: 12,
            padding: "6px 10px", display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ fontSize: 12 }}>🏷️</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>10% OFF</span>
          </div>
        </div>
        <div style={{
          position: "absolute", top: 80, right: 16,
          animation: "floatBadge 3.5s ease-in-out infinite 1s",
        }}>
          <div style={{
            background: "rgba(163,230,53,0.18)", backdropFilter: "blur(10px)",
            border: "1px solid rgba(163,230,53,0.3)", borderRadius: 12,
            padding: "5px 9px", display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ fontSize: 11 }}>⭐</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#A3E635" }}>4.9 rating</span>
          </div>
        </div>

        {/* Headline over photo bottom */}
        <div style={{
          position: "absolute", bottom: 14, left: 16, right: 16,
          animation: "wmFadeUp2 0.75s cubic-bezier(0.22,1,0.36,1) both",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)",
            letterSpacing: "0.18em", textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 6, marginBottom: 5,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22C55E", display: "inline-block", boxShadow: "0 0 5px #22C55E" }} />
            ETHIOPIA &nbsp;ኢትዮጵያ
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1.15, letterSpacing: "-0.7px" }}>
            Shop smarter,<br />save bigger.
          </div>
        </div>
      </div>

      {/* ── LOWER DARK SECTION ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#050A14", position: "relative", overflow: "hidden" }}>

        {/* Grid texture */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.04, pointerEvents: "none" }}>
          <defs>
            <pattern id="wm-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#fff" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wm-grid)" />
        </svg>

        {/* Value prop chips + countdown */}
        <div style={{
          padding: "14px 16px 8px", display: "flex", flexDirection: "column", gap: 7,
          animation: "wmFadeUp3 0.9s cubic-bezier(0.22,1,0.36,1) both",
          position: "relative", zIndex: 1,
        }}>
        </div>

        {/* Buttons */}
        <div style={{ padding: "0 16px 32px", display: "flex", flexDirection: "column", gap: 10, position: "relative", zIndex: 1 }}>
          <button
            className="wm-primary"
            onClick={onStartShopping}
            style={{
              width: "100%", padding: "16px 24px", borderRadius: 16,
              border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #A3E635 0%, #38BDF8 100%)",
              color: "#050A14", fontSize: 15, fontWeight: 900,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 8px 28px rgba(163,230,53,0.35)",
              animation: "wmBtnPulse 2.4s ease-in-out infinite",
            }}
          >
            <Sparkles size={17} />
            Start Shopping Now
            <ArrowRight size={16} />
          </button>

          <button
            onClick={onLogin}
            style={{
              width: "100%", padding: "11px", background: "transparent",
              border: "none", cursor: "pointer", fontSize: 13,
              color: "rgba(255,255,255,0.5)", fontWeight: 500,
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>Log in →</span>
          </button>

          <WelcomeCountdown />

          <p
            style={{
              margin: "4px 2px 0",
              textAlign: "center",
              fontSize: 11.5,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            HahuShop connects Ethiopian customers with quality products at affordable prices,
            while also serving public employees and businesses with trusted sellers, reliable
            delivery, and value-focused deals.
          </p>

          <div
            style={{
              paddingTop: 2,
              textAlign: "center",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.74)",
              textTransform: "uppercase",
            }}
          >
            HAHUSHOP ® 2026
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   CHECKOUT GATE MODAL
══════════════════════════════════════════════════════════════════════════════ */

function CheckoutGateModal({
  open,
  onClose,
  onLogin,
  onSignup,
  onContinueGuest,
}: {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignup: () => void;
  onContinueGuest: () => void;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(15,23,42,0.6)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "24px 24px 0 0",
          padding: "24px",
          width: "100%",
          maxWidth: 420,
          animation: "slideUp 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>

        <div
          style={{
            width: 48,
            height: 6,
            background: "#e2e8f0",
            borderRadius: 3,
            margin: "0 auto 20px",
          }}
        />

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <Lock size={28} color="#d97706" />
          </div>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              marginBottom: 8,
            }}
          >
            Almost there!
          </h3>
          <p
            style={{
              fontSize: 14,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            Create an account to save your cart and track your order in real-time.
          </p>
        </div>

        <button
          onClick={onSignup}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 14,
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Gift size={18} />
          Create Account — 10% Off First Order
        </button>

        <button
          onClick={onLogin}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            background: "#f1f5f9",
            color: "#0f172a",
            fontSize: 15,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          Log in to existing account
        </button>

        <button
          onClick={onContinueGuest}
          style={{
            width: "100%",
            padding: "12px",
            background: "transparent",
            border: "none",
            color: "#94a3b8",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Continue as guest
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   DESKTOP COMPONENTS — COMPLETELY UNCHANGED
══════════════════════════════════════════════════════════════════════════════ */

function ProductSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse flex flex-col">
      <div className="aspect-square bg-slate-200" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-slate-200 rounded w-3/4" />
        <div className="h-3 bg-slate-200 rounded w-1/2" />
        <div className="h-4 bg-slate-200 rounded w-1/3 mt-2" />
        <div className="h-9 bg-slate-200 rounded-xl mt-3" />
      </div>
    </div>
  );
}

function DesktopProductCard({
  product,
  onShop,
  badge,
}: {
  product: ApprovedProduct;
  onShop: () => void;
  badge?: string;
}) {
  const hasDiscount =
    product.original_price_cents && product.original_price_cents > (product.final_price_cents || 0);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-xl hover:border-blue-300 transition-all duration-300 flex flex-col h-full">
      <div className="aspect-square bg-slate-50 relative cursor-pointer overflow-hidden" onClick={onShop}>
        {product.image_url && !imgFailed ? (
          <img
            src={product.image_url}
            alt={product.name}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl group-hover:scale-110 transition-transform duration-300">
            {product.emoji || "📦"}
          </div>
        )}
        {badge && (
          <div
            className={`absolute top-3 left-3 px-3 py-1.5 text-xs font-bold rounded-full shadow-lg ${
              badge.includes("%")
                ? "bg-gradient-to-r from-rose-500 to-rose-600 text-white"
                : "bg-amber-400 text-slate-900"
            }`}
          >
            {badge}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3
          className="text-sm font-semibold text-slate-900 line-clamp-2 mb-2 cursor-pointer hover:text-blue-600 transition-colors"
          onClick={onShop}
        >
          {product.name}
        </h3>
        <div className="flex items-center gap-1.5 mb-2">
          {product.rating_count > 0 ? (
            <>
              <div className="flex items-center text-amber-400 text-sm">
                <span className="font-bold">{product.rating_avg.toFixed(1)}</span>
                <Star className="w-3.5 h-3.5 fill-current ml-0.5" />
              </div>
              <span className="text-xs text-slate-500">({formatCount(product.rating_count)})</span>
            </>
          ) : (
            <span className="text-xs text-slate-400">No reviews yet</span>
          )}
        </div>
        <div className="mb-3">
          <div className="text-base font-bold text-slate-900">{money(product.final_price_cents)}</div>
          {hasDiscount && (
            <div className="text-xs text-slate-500 mt-0.5">
              Was: <span className="line-through">{money(product.original_price_cents)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-3">
          <span className="text-blue-600 font-bold italic">prime</span>
          <span className="text-slate-500">Tomorrow 10 AM – 3 PM</span>
        </div>
        <button
          onClick={onShop}
          className="mt-auto w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group/btn"
        >
          Shop Now <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  onLinkClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onLinkClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5 ml-7">{subtitle}</p>}
      </div>
      <button
        onClick={onLinkClick}
        className="text-sm text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 hover:gap-2 transition-all"
      >
        See all <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function SectionGrid({
  loading,
  products,
  onShop,
  badge,
}: {
  loading: boolean;
  products: ApprovedProduct[];
  onShop: (id: string) => void;
  badge?: (p: ApprovedProduct) => string | undefined;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!products.length) {
    return <p className="text-sm text-slate-400 py-8 text-center">No products yet — check back soon.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {products.map((product) => (
        <DesktopProductCard
          key={product.id}
          product={product}
          onShop={() => onShop(product.id)}
          badge={badge?.(product)}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════════════════ */

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceIntro = searchParams.get("intro") === "1";
  const mobileTopRef = useRef<HTMLDivElement>(null);
  const mobileToast = useMToast();

  // 🔒 Auth state
  const miniCart = useMiniCart();
  const isAuthed = miniCart?.isAuthed ?? false;

  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [slideIndex, setSlideIndex] = useMSlider(heroSlides.length);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [newArrivals, setNewArrivals] = useState<ApprovedProduct[]>([]);
  const [deals, setDeals] = useState<ApprovedProduct[]>([]);
  const [topRated, setTopRated] = useState<ApprovedProduct[]>([]);
  const [explore, setExplore] = useState<ApprovedProduct[]>([]);

  const [loadingNew, setLoadingNew] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [loadingTop, setLoadingTop] = useState(true);
  const [loadingExplore, setLoadingExplore] = useState(true);

  const [topPicks, setTopPicks] = useState<ApprovedProduct[]>([]);
  const [loadingTopPicks, setLoadingTopPicks] = useState(true);

  const [mobileSearch, setMobileSearch] = useState("");
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [userName, setUserName] = useState<string | null>(null);
  const [userInitial, setUserInitial] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mobileCartCount, setMobileCartCount] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Welcome modal state - show on first open only
  const [showWelcome, setShowWelcome] = useState(false);
  // Checkout gate state
  const [showCheckoutGate, setShowCheckoutGate] = useState(false);
  // Track pending checkout navigation
  const [pendingCheckout, setPendingCheckout] = useState(false);

  const mobileAllProducts = useMemo(() => {
    const seen = new Set<string>();
    return [...newArrivals, ...deals, ...topRated, ...topPicks, ...explore].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [newArrivals, deals, topRated, topPicks, explore]);

  const loadingMobileFeed = loadingNew || loadingDeals || loadingTop || loadingTopPicks || loadingExplore;

  // Check if user has seen welcome screen
  useEffect(() => {
    try {
      if (forceIntro) {
        setShowWelcome(true);
        return;
      }

      const hasSeenWelcome = localStorage.getItem("hahushop-welcome-seen-v1");
      if (!hasSeenWelcome && !isAuthed) {
        setShowWelcome(true);
      }
    } catch (err) {
      console.error("Welcome state read error:", err);
    }
  }, [forceIntro, isAuthed]);

  // Listen for checkout gate trigger from cart
  useEffect(() => {
    const handleCheckoutAttempt = () => {
      if (!isAuthed) {
        setShowCheckoutGate(true);
      }
    };

    window.addEventListener("checkout-attempt", handleCheckoutAttempt);
    return () => window.removeEventListener("checkout-attempt", handleCheckoutAttempt);
  }, [isAuthed]);

  useEffect(() => {
    function updateCart() {
      try {
        const raw = localStorage.getItem("shopease-cart");
        const cart = raw ? JSON.parse(raw) : [];
        setMobileCartCount(cart.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0));
      } catch (err) {
        console.error("Cart parse error:", err);
        setMobileCartCount(0);
      }
    }

    updateCart();
    window.addEventListener("storage", updateCart);
    window.addEventListener("cart-updated", updateCart);

    return () => {
      window.removeEventListener("storage", updateCart);
      window.removeEventListener("cart-updated", updateCart);
    };
  }, []);

  useEffect(() => {
    async function checkUser() {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (user) {
          const name =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            null;
          setUserName(name);
          setUserEmail(user.email ?? null);
          setUserInitial(name ? name[0].toUpperCase() : user.email?.[0].toUpperCase() ?? null);

          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

          setUserRole(profile?.role ?? "customer");
        }
      } catch (err) {
        console.error("Auth check error:", err);
      }
    }

    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const user = session?.user ?? null;

      if (user) {
        const name =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          null;

        setUserName(name);
        setUserEmail(user.email ?? null);
        setUserInitial(name ? name[0].toUpperCase() : user.email?.[0].toUpperCase() ?? null);

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        setUserRole(profile?.role ?? "customer");
      } else {
        setUserName(null);
        setUserEmail(null);
        setUserInitial(null);
        setUserRole(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUserName(null);
    setUserEmail(null);
    setUserInitial(null);
    setUserRole(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("shopease_is_logged_in");
    }
    router.push("/auth/login");
  }

  // Welcome modal handlers
  function handleStartShopping() {
    setShowWelcome(false);
    try {
      localStorage.setItem("hahushop-welcome-seen-v1", "1");
    } catch (err) {
      console.error("Welcome state save error:", err);
    }
  }

  function handleCreateAccountFromWelcome() {
    setShowWelcome(false);
    try {
      localStorage.setItem("hahushop-welcome-seen-v1", "1");
    } catch (err) {
      console.error("Welcome state save error:", err);
    }
    router.push("/auth/signup?promo=WELCOME10");
  }

  function handleLoginFromWelcome() {
    setShowWelcome(false);
    try {
      localStorage.setItem("hahushop-welcome-seen-v1", "1");
    } catch (err) {
      console.error("Welcome state save error:", err);
    }
    router.push("/auth/login");
  }

  // Checkout gate handlers
  function handleCheckoutSignup() {
    setShowCheckoutGate(false);
    router.push("/auth/signup?promo=FIRST10&redirect=/checkout");
  }

  function handleCheckoutLogin() {
    setShowCheckoutGate(false);
    router.push("/auth/login?redirect=/checkout");
  }

  function handleContinueGuest() {
    setShowCheckoutGate(false);
    router.push("/checkout");
  }

  // ── Stale-while-revalidate: show cached data instantly, refresh in background ─
  useEffect(() => {
    // Restore cached data immediately so the page isn't blank
    try {
      const cached = localStorage.getItem("hahu-home-cache");
      if (cached) {
        const c = JSON.parse(cached);
        if (c.categories) {
          setDbCategories(c.categories);
          const map: Record<string, string> = {};
          for (const cat of c.categories) {
            map[cat.slug] = cat.id;
            map[cat.slug.replace(/-/g, "_")] = cat.id;
          }
          setCategoryMap(map);
        }
        if (c.hero?.length) setHeroSlides(c.hero);
        if (c.newArrivals?.length) { setNewArrivals(c.newArrivals); setLoadingNew(false); }
        if (c.deals?.length) { setDeals(c.deals); setLoadingDeals(false); }
        if (c.topRated?.length) { setTopRated(c.topRated); setLoadingTop(false); }
        if (c.topPicks?.length) { setTopPicks(c.topPicks); setLoadingTopPicks(false); }
        if (c.explore?.length) { setExplore(c.explore); setLoadingExplore(false); }
        setLoadingCategories(false);
      }
    } catch { /* ignore corrupt cache */ }

    // Fetch fresh data in background
    async function loadAll() {
      const [
        catRes,
        heroRes,
        newRes,
        dealsRes,
        topRes,
        topPicksRes,
        exploreRes,
      ] = await Promise.all([
        supabase
          .from("categories")
          .select("id,name,slug")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("hero_slides")
          .select("id,title,tagline,image_url,link_url")
          .eq("is_active", true)
          .eq("is_archived", false)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select(PRODUCT_FIELDS)
          .eq("status", "approved")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("products")
          .select(PRODUCT_FIELDS)
          .eq("status", "approved")
          .eq("is_active", true)
          .not("price_cents", "is", null)
          .not("final_price_cents", "is", null)
          .gt("price_cents", 0)
          .gt("final_price_cents", 0)
          .limit(50),
        supabase
          .from("products")
          .select(PRODUCT_FIELDS)
          .eq("status", "approved")
          .eq("is_active", true)
          .gt("rating_count", 0)
          .order("rating_avg", { ascending: false })
          .order("rating_count", { ascending: false })
          .limit(8),
        supabase
          .from("products")
          .select(PRODUCT_FIELDS)
          .eq("status", "approved")
          .eq("is_active", true)
          .gt("rating_count", 10)
          .order("rating_avg", { ascending: false })
          .limit(8),
        supabase
          .from("products")
          .select(PRODUCT_FIELDS)
          .eq("status", "approved")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .range(8, 32),
      ]);

      // Categories
      if (!catRes.error && catRes.data) {
        setDbCategories(catRes.data);
        const map: Record<string, string> = {};
        for (const c of catRes.data) {
          map[c.slug] = c.id;
          map[c.slug.replace(/-/g, "_")] = c.id;
        }
        setCategoryMap(map);
      }
      setLoadingCategories(false);

      // Hero slides
      setHeroSlides(
        heroRes.data?.length
          ? heroRes.data
          : [
              { id: "1", title: "New Arrivals", tagline: "Check out the latest trends", image_url: null, link_url: "/shop" },
              { id: "2", title: "Summer Sale", tagline: "Up to 50% off", image_url: null, link_url: "/shop" },
            ]
      );

      // New arrivals
      const newMapped = (newRes.data ?? []).map(mapProduct);
      setNewArrivals(newMapped);
      setLoadingNew(false);

      // Deals
      const dealRows = (dealsRes.data ?? [])
        .map(mapProduct)
        .filter(
          (p) =>
            p.original_price_cents &&
            p.final_price_cents &&
            p.final_price_cents < p.original_price_cents
        )
        .sort(
          (a, b) =>
            discountPct(b.original_price_cents, b.final_price_cents) -
            discountPct(a.original_price_cents, a.final_price_cents)
        )
        .slice(0, 8);
      setDeals(dealRows);
      setLoadingDeals(false);

      // Top rated
      const topMapped = (topRes.data ?? []).map(mapProduct);
      setTopRated(topMapped);
      setLoadingTop(false);

      // Top picks
      const topPicksMapped = (topPicksRes.data ?? []).map(mapProduct);
      setTopPicks(topPicksMapped);
      setLoadingTopPicks(false);

      // Explore
      const exploreMapped = (exploreRes.data ?? []).map(mapProduct);
      setExplore(exploreMapped);
      setLoadingExplore(false);

      // Cache for instant load next visit
      try {
        localStorage.setItem("hahu-home-cache", JSON.stringify({
          categories: catRes.data ?? [],
          hero: heroRes.data ?? [],
          newArrivals: newMapped,
          deals: dealRows,
          topRated: topMapped,
          topPicks: topPicksMapped,
          explore: exploreMapped,
          ts: Date.now(),
        }));
      } catch { /* storage full — ignore */ }
    }

    loadAll();
  }, []);

  const {
    dedupedNew,
    dedupedDeals,
    dedupedTop,
    dedupedTopPicks,
    dedupedExplore,
  } = useMemo(() => {
    const seen = new Set<string>();

    return {
      dedupedNew: deduped(newArrivals, seen),
      dedupedDeals: deduped(deals, seen),
      dedupedTop: deduped(topRated, seen),
      dedupedTopPicks: deduped(topPicks, seen),
      dedupedExplore: deduped(explore, seen),
    };
  }, [newArrivals, deals, topRated, topPicks, explore]);

  const activeSlide = heroSlides[slideIndex];

  const mobileFiltered = useMemo(() => {
    if (!mobileSearch.trim()) return mobileAllProducts;
    const q = mobileSearch.trim().toLowerCase();

    return mobileAllProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
    );
  }, [mobileAllProducts, mobileSearch]);

  const mCatNames = useMemo(() => {
    const priorityKeys = HARDCODED_CATEGORIES.filter((c) => c.key !== "all").map((c) => c.key);

    const prioritized: string[] = [];
    const rest: string[] = [];

    for (const key of priorityKeys) {
      const match = dbCategories.find(
        (c) => c.slug === key || c.slug.replace(/-/g, "_") === key
      );
      if (match) prioritized.push(match.name);
    }

    for (const cat of dbCategories) {
      const alreadyIn = prioritized.includes(cat.name);
      if (!alreadyIn) rest.push(cat.name);
    }

    return ["All", ...prioritized, ...rest];
  }, [dbCategories]);

  function mSelectCat(name: string) {
    if (name === "All") {
      router.push("/shop");
      return;
    }

    const cat = dbCategories.find((c) => c.name === name);
    if (cat) {
      router.push(`/shop?category=${encodeURIComponent(cat.id)}`);
    } else {
      mobileToast.show("Category not available yet", "info");
    }
  }

  function goToShop(category?: string) {
    if (category && category !== "all") {
      const uuid = categoryMap[category] || categoryMap[category.replace(/_/g, "-")] || category;
      router.push(`/shop?category=${encodeURIComponent(uuid)}`);
    } else {
      router.push("/shop");
    }
  }

  // Product navigation - no auth gate, immediate browsing
  function goToProduct(id: string) {
    router.push(`/shop/${id}`);
  }

  // Cart navigation - with auth gate for non-authenticated users
  function goToCart() {
    if (!isAuthed && mobileCartCount > 0) {
      setShowCheckoutGate(true);
    } else {
      router.push("/checkout");
    }
  }

  const handleLogoTap = useCallback(() => {
    setMobileSearch("");
    mobileTopRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  function handleMobileSearchSubmit() {
    if (!mobileSearch.trim()) {
      router.push("/shop");
      return;
    }
    router.push(`/shop?q=${encodeURIComponent(mobileSearch.trim())}`);
  }

  function handleCameraTap() {
    imageInputRef.current?.click();
  }

  function handleImagePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        if (typeof window !== "undefined" && typeof reader.result === "string") {
          sessionStorage.setItem("shopease_visual_search_image", reader.result);
          sessionStorage.setItem("shopease_visual_search_name", file.name);
        }

        setSelectedImage(reader.result as string);
        mobileToast.show("Image uploaded", "success");
        router.push("/shop");
      } catch (err) {
        console.error("Image pick error:", err);
        mobileToast.show("Could not use image", "error");
      }
    };

    reader.onerror = () => {
      mobileToast.show("Failed to read image", "error");
    };

    reader.readAsDataURL(file);

    e.currentTarget.value = "";
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Welcome Modal - Single Screen */}
      <WelcomeModal
        open={showWelcome}
        onStartShopping={handleStartShopping}
        onCreateAccount={handleCreateAccountFromWelcome}
        onLogin={handleLoginFromWelcome}
      />

      {/* Checkout Gate Modal */}
      <CheckoutGateModal
        open={showCheckoutGate}
        onClose={() => setShowCheckoutGate(false)}
        onLogin={handleCheckoutLogin}
        onSignup={handleCheckoutSignup}
        onContinueGuest={handleContinueGuest}
      />

      <MobileAuthSheet
        open={authSheetOpen}
        onClose={() => setAuthSheetOpen(false)}
        userInitial={userInitial}
        userName={userName}
        userEmail={userEmail}
        userRole={userRole}
        onLogout={handleLogout}
      />

      <div className="md:hidden flex flex-col" style={{ minHeight: "100svh" }} ref={mobileTopRef}>
        <style>{`*::-webkit-scrollbar{display:none}`}</style>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleImagePicked}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
            background: "#f5f5f5",
            position: "relative",
            height: "100svh",
          }}
        >
          <MToastStack toasts={mobileToast.toasts} />

          <div style={{ position: "sticky", top: 0, zIndex: 40, background: "transparent" }}>
            <MHeader
              cartTotal={mobileCartCount}
              onCartTap={goToCart}
              onLogoTap={handleLogoTap}
              onAccountTap={() => setAuthSheetOpen(true)}
            />

            <div
              style={{
                background: "rgba(255,255,255,0.22)",
                borderBottom: "1px solid rgba(255,255,255,0.30)",
                backdropFilter: "blur(18px) saturate(180%)",
                WebkitBackdropFilter: "blur(18px) saturate(180%)",
              }}
            >
              <div style={{ padding: "8px 0" }}>
                <MSearchBar
                  value={mobileSearch}
                  onChange={setMobileSearch}
                  onSubmit={handleMobileSearchSubmit}
                  onImageTap={handleCameraTap}
                  selectedImage={selectedImage}
                  onClearImage={() => { 
                    setSelectedImage(null);
                    sessionStorage.removeItem("shopease_visual_search_image");
                    sessionStorage.removeItem("shopease_visual_search_name");
                  }}
                />
              </div>

              <MCategoryRail categories={mCatNames} active="All" onSelect={mSelectCat} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", paddingBottom: 84 }}>
            <MHero slides={heroSlides} idx={slideIndex} setIdx={setSlideIndex} onShopNow={(link) => router.push(link || "/shop")} />

            <div style={{ margin: "0 12px" }}>
              <FirstOrderBonusBanner compact />
            </div>

            <MShelf
              title="Top Picks"
              subtitle="Highest rated by customers"
              products={topPicks}
              onOpen={goToProduct}
              onSeeAll={() => router.push("/shop?sort=rating")}
            />

            <MShelf
              title="New Arrivals"
              subtitle="Fresh picks just dropped"
              products={newArrivals}
              onOpen={goToProduct}
              onSeeAll={() => router.push("/shop?sort=newest")}
            />

            <MShelf
              title="Today's Deals"
              subtitle="Biggest discounts first"
              products={deals}
              onOpen={goToProduct}
              onSeeAll={() => router.push("/shop?sort=deals")}
            />

            <MShelf
              title="Top Rated"
              subtitle="Highest rated by buyers"
              products={topRated}
              onOpen={goToProduct}
              onSeeAll={() => router.push("/shop?sort=rating")}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 12px 10px" }}>
              <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                Shop Feed
              </span>
              <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            </div>

            {loadingMobileFeed ? (
              <MGridSkeleton />
            ) : mobileFiltered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 16px" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
                  No results found
                </div>
                <button
                  onClick={() => setMobileSearch("")}
                  style={{
                    padding: "8px 18px",
                    background: "#0f172a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: "1px solid #ebebeb" }}>
                {mobileFiltered.map((p, i) => (
                  <div
                    key={p.id}
                    style={{
                      borderRight: i % 2 === 0 ? "1px solid #ebebeb" : "none",
                      borderBottom: "1px solid #ebebeb",
                    }}
                  >
                    <MProductCard p={p} onOpen={() => goToProduct(p.id)} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <MFAB count={mobileCartCount} />
        </div>

      </div>

      <main className="hidden md:block max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => goToShop("all")}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg font-bold text-sm transition-all"
            >
              <Menu className="w-4 h-4" /> All
            </button>
            {HARDCODED_CATEGORIES.slice(1).map((cat) => (
              <button
                key={cat.key}
                onClick={() => goToShop(cat.key)}
                className="flex-shrink-0 px-4 py-2 hover:bg-slate-100 rounded-lg text-sm font-semibold text-slate-700 transition-all whitespace-nowrap"
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {activeSlide && (
          <section className="glass rounded-[28px] p-4 md:p-6 glass-ring overflow-hidden relative">
            <div className="h-full min-h-[220px] md:min-h-[260px] flex flex-row gap-4 md:gap-6 items-stretch">
              <div className="flex flex-col justify-between w-1/2 min-w-[50%]">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="rounded-full bg-emerald-500/90 px-3 py-1 text-[11px] font-semibold text-white">
                      New
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700">Curated by HahuShop</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 leading-tight">
                    {activeSlide.title || "New Arrivals for You"}
                  </h1>
                  <p className="mt-3 text-[11px] sm:text-sm md:text-[15px] text-slate-700">
                    {activeSlide.tagline || ""}
                  </p>
                </div>
                <div className="mt-3 sm:mt-4">
                  <button
                    onClick={() => router.push(activeSlide.link_url || "/shop")}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-lime-400 to-sky-400 px-6 sm:px-7 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-slate-900 shadow-lg shadow-lime-300/40 transition-all duration-200 hover:scale-[1.03] hover:shadow-lime-300/60"
                  >
                    Shop now <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div
                className="w-1/2 min-w-[50%] flex items-stretch cursor-pointer group"
                onClick={() => router.push(activeSlide.link_url || "/shop")}
              >
                <div className="relative w-full h-full rounded-[24px] overflow-hidden glass-card glass-ring">
                  {activeSlide.image_url ? (
                    <img
                      src={activeSlide.image_url}
                      alt={activeSlide.title || ""}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="absolute inset-0 h-full w-full bg-gradient-to-tr from-slate-900 via-slate-800 to-sky-700" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/30 to-black/10" />
                  <div className="absolute inset-0 flex flex-col justify-between p-3 sm:p-4 md:p-5">
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-white/80">
                      <span className="rounded-full bg-black/40 px-3 py-1 font-semibold">
                        Today&apos;s highlight
                      </span>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-white">
                        {activeSlide.title || "Featured collection"}
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-white/80 mt-1 max-w-xs">
                        {activeSlide.tagline || "Curated picks from verified sellers."}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <button className="rounded-full bg-white/90 px-3 sm:px-4 py-1.5 text-[10px] sm:text-[11px] font-semibold text-slate-900 shadow-sm">
                          Explore this collection
                        </button>
                        <div className="flex items-center gap-1.5">
                          {heroSlides.map((slide, i) => (
                            <span
                              key={slide.id}
                              className={
                                i === slideIndex
                                  ? "h-1.5 w-4 rounded-full bg-emerald-400 shadow shadow-emerald-300/50"
                                  : "h-1.5 w-2 rounded-full bg-white/50"
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <SectionHeader
            icon={<Sparkles className="w-5 h-5 text-blue-500" />}
            title="New Arrivals"
            subtitle="Recently added products, newest first"
            onLinkClick={() => router.push("/new")}
          />
          <SectionGrid loading={loadingNew} products={dedupedNew} onShop={goToProduct} />
        </section>

        {(loadingDeals || dedupedDeals.length > 0) && (
          <section className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <SectionHeader
              icon={<Tag className="w-5 h-5 text-rose-500" />}
              title="Today's Deals"
              subtitle="Best discounts, sorted by biggest saving"
              onLinkClick={() => router.push("/deals")}
            />
            <SectionGrid
              loading={loadingDeals}
              products={dedupedDeals}
              onShop={goToProduct}
              badge={(p) => {
                if (!p.original_price_cents || !p.final_price_cents) return undefined;
                const pct = Math.round((1 - p.final_price_cents / p.original_price_cents) * 100);
                return pct > 0 ? `${pct}% OFF` : undefined;
              }}
            />
          </section>
        )}

        {(loadingTopPicks || dedupedTopPicks.length > 0) && (
          <section className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <SectionHeader
              icon={<Heart className="w-5 h-5 text-rose-500 fill-rose-500" />}
              title="Top Picks"
              subtitle="Highest rated by customers"
              onLinkClick={() => router.push("/shop?sort=rating")}
            />
            <SectionGrid
              loading={loadingTopPicks}
              products={dedupedTopPicks}
              onShop={goToProduct}
              badge={(p) => (p.rating_avg >= 4.5 && p.rating_count > 0 ? `⭐ ${p.rating_avg.toFixed(1)}` : undefined)}
            />
          </section>
        )}

        <section className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <SectionHeader
            icon={<Star className="w-5 h-5 text-amber-400 fill-amber-400" />}
            title="Top Rated"
            subtitle={dedupedTop.length === 0 && !loadingTop ? undefined : "Highest rated by verified buyers"}
            onLinkClick={() => router.push("/shop?sort=rating")}
          />
          <SectionGrid
            loading={loadingTop}
            products={dedupedTop}
            onShop={goToProduct}
            badge={(p) => (p.rating_avg >= 4.5 && p.rating_count > 0 ? `⭐ ${p.rating_avg.toFixed(1)}` : undefined)}
          />
          {!loadingTop && dedupedTop.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-slate-400">No reviewed products yet — be the first to leave a review!</p>
            </div>
          )}
        </section>

        {(loadingExplore || dedupedExplore.length > 0) && (
          <section className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <SectionHeader
              icon={<Grid className="w-5 h-5 text-slate-500" />}
              title="More to Explore"
              subtitle="All approved products on HahuShop"
              onLinkClick={() => goToShop()}
            />
            <SectionGrid loading={loadingExplore} products={dedupedExplore} onShop={goToProduct} />
          </section>
        )}
      </main>

      <footer className="hidden md:block bg-slate-900 text-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
            <div>
              <h3 className="font-bold mb-4 text-white">Get to Know Us</h3>
              <ul className="space-y-3 text-slate-400">
                <li><Link href="/contact" className="hover:text-white transition-colors">About HahuShop</Link></li>
                <li><Link href="/auth/signup?redirect=%2Fseller" className="hover:text-white transition-colors">Careers</Link></li>
                <li><Link href="/deals" className="hover:text-white transition-colors">Press</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-white">Make Money with Us</h3>
              <ul className="space-y-3 text-slate-400">
                <li><Link href="/auth/signup?redirect=%2Fseller" className="hover:text-white transition-colors">Sell on HahuShop</Link></li>
                <li><Link href="/specials" className="hover:text-white transition-colors">Become an Affiliate</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors">Advertise</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-white">Payment Products</h3>
              <ul className="space-y-3 text-slate-400">
                <li><Link href="/business" className="hover:text-white transition-colors">Hahu Business</Link></li>
                <li><Link href="/specials" className="hover:text-white transition-colors">HahuShop Points</Link></li>
                <li><Link href="/business" className="hover:text-white transition-colors">HahuShop Credit</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-white">Let Us Help You</h3>
              <ul className="space-y-3 text-slate-400">
                <li><Link href="/account" className="hover:text-white transition-colors">Your Account</Link></li>
                <li><Link href="/my-orders" className="hover:text-white transition-colors">Your Orders</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors">Help Center</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-10 pt-8 text-center text-slate-500 text-sm">
            <p>© 2026 HahuShop. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}
