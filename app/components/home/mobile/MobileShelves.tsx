"use client";

import Image from "next/image";
import { ChevronRight } from "lucide-react";

const M_ACCENT = "#FF0255";

export type MobileApprovedProduct = {
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

function MobileSectionHeader({
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

function MobileShelfCard({
  p,
  onOpen,
}: {
  p: MobileApprovedProduct;
  onOpen: () => void;
}) {
  const disc = discountPct(p.original_price_cents, p.final_price_cents);

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
          {p.image_url ? (
            <Image
              src={p.image_url}
              alt={p.name}
              fill
              sizes="150px"
              style={{ objectFit: "cover" }}
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
              zIndex: 1,
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

type Props = {
  title: string;
  subtitle?: string;
  products: MobileApprovedProduct[];
  onOpen: (id: string) => void;
  onSeeAll: () => void;
};

export default function MobileShelves({
  title,
  subtitle,
  products,
  onOpen,
  onSeeAll,
}: Props) {
  if (!products.length) return null;

  return (
    <div style={{ marginTop: 16, background: "#fff", paddingBottom: 12 }}>
      <MobileSectionHeader title={title} subtitle={subtitle} onSeeAll={onSeeAll} />

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
            <MobileShelfCard key={p.id} p={p} onOpen={() => onOpen(p.id)} />
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