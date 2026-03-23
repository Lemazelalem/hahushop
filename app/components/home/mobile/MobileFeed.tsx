"use client";

import Image from "next/image";
import { ShoppingCart } from "lucide-react";

const M_ACCENT = "#FF0255";

export type MobileFeedProduct = {
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

function MobileProductCard({
  p,
  onOpen,
}: {
  p: MobileFeedProduct;
  onOpen: () => void;
}) {
  const disc = discountPct(p.original_price_cents, p.final_price_cents);

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
          {p.image_url ? (
            <Image
              src={p.image_url}
              alt={p.name}
              fill
              sizes="(max-width: 768px) 50vw, 200px"
              style={{ objectFit: "cover" }}
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
              zIndex: 1,
            }}
          >
            -{disc}%
          </div>
        )}

        <button
          aria-label="Add to wishlist"
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
            zIndex: 1,
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

function MobileGridSkeleton() {
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

function MobileFAB({
  count,
  onCheckout,
}: {
  count: number;
  onCheckout: () => void;
}) {
  if (count === 0) return null;

  return (
    <div style={{ position: "absolute", bottom: 74, right: 12 }}>
      <button
        onClick={onCheckout}
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
          {count}
        </span>
      </button>
    </div>
  );
}

type Props = {
  loading: boolean;
  products: MobileFeedProduct[];
  searchValue: string;
  onClearSearch: () => void;
  onOpenProduct: (id: string) => void;
  cartCount: number;
  onCheckout: () => void;
};

export default function MobileFeed({
  loading,
  products,
  searchValue,
  onClearSearch,
  onOpenProduct,
  cartCount,
  onCheckout,
}: Props) {
  return (
    <>
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

      {loading ? (
        <MobileGridSkeleton />
      ) : products.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 16px" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
            No results found
          </div>
          <button
            onClick={onClearSearch}
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
            {searchValue ? "Clear search" : "Browse all"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderTop: "1px solid #ebebeb" }}>
          {products.map((p, i) => (
            <div
              key={p.id}
              style={{
                borderRight: i % 2 === 0 ? "1px solid #ebebeb" : "none",
                borderBottom: "1px solid #ebebeb",
              }}
            >
              <MobileProductCard p={p} onOpen={() => onOpenProduct(p.id)} />
            </div>
          ))}
        </div>
      )}

      <MobileFAB count={cartCount} onCheckout={onCheckout} />
    </>
  );
}