"use client";

import { Search, Camera, X, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";

const M_ACCENT = "#FF0255";

function SearchBar({
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
          fontSize: 14,
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

function CategoryRail({
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

type Props = {
  cartTotal: number;
  onCartTap: () => void;
  onLogoTap: () => void;
  onAccountTap: () => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;
  onImageTap: () => void;
  categories: string[];
  activeCategory: string;
  onCategorySelect: (name: string) => void;
};

export default function MobileHeader({
  cartTotal,
  onCartTap,
  onLogoTap,
  onAccountTap,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onImageTap,
  categories,
  activeCategory,
  onCategorySelect,
}: Props) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "transparent" }}>
      <header
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
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
          {/* Logo */}
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
              gap: 1,
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.6px",
                fontFamily: "inherit",
                background: "linear-gradient(90deg,#22c55e 0%,#a3e635 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                lineHeight: 1,
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
              Ethiopia
            </span>
          </button>

          {/* Account + Cart */}
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
              data-cart-target="true"
              style={{ position: "relative", padding: 6, background: "none", border: "none", cursor: "pointer" }}
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
                  {cartTotal}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ padding: "8px 0" }}>
          <SearchBar
            value={searchValue}
            onChange={onSearchChange}
            onSubmit={onSearchSubmit}
            onImageTap={onImageTap}
          />
        </div>

        <CategoryRail
          categories={categories}
          active={activeCategory}
          onSelect={onCategorySelect}
        />
      </div>
    </div>
  );
}