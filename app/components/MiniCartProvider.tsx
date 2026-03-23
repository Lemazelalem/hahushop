// app/components/MiniCartProvider.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  CART_KEY,
  type Cart,
  type CartItemKind,
  addItemToCart,
  clearCart as clearCartHelper,
  parseCart,
  serialiseCart,
  countItemsInCart,
} from "@/lib/cart";

// ─── Meta type ────────────────────────────────────────────────────────────────
// Generic metadata bag for cart items. Supports price overrides and any
// additional custom fields (color, size, etc.).

export type ItemMeta = {
  overridePriceCents?: number | null;
  colorVariantId?: string | null;
  colorName?: string | null;
  sizeVariantId?: string | null;
  sizeLabel?: string | null;
  priceAdjustCents?: number;
  finalPriceCents?: number;
  [key: string]: any;
};

// ─── Context type ─────────────────────────────────────────────────────────────

type MiniCartContextType = {
  cart: Cart;
  itemCount: number;
  isLoaded: boolean;
  isAuthed: boolean;

  // Core actions
  addItem: (
    kind: CartItemKind,
    id: string | number,
    quantityDelta?: number,
    meta?: ItemMeta
  ) => void;
  clearCart: () => void;

  // Convenience actions
  removeItem: (
    kind: CartItemKind,
    id: string | number,
    meta?: ItemMeta
  ) => void;
  setQty: (
    kind: CartItemKind,
    id: string | number,
    nextQty: number,
    meta?: ItemMeta
  ) => void;
  getQty: (
    kind: CartItemKind,
    id: string | number,
    meta?: ItemMeta
  ) => number;
};

const MiniCartContext = createContext<MiniCartContextType | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readQtyFromItem(it: any): number {
  const q = Number(it?.qty ?? it?.quantity ?? 0);
  return Number.isFinite(q) ? q : 0;
}

// Match by kind + id + variant identifiers only (colorVariantId, sizeVariantId)
// Ignores price-related fields like overridePriceCents for matching
function matchesItem(
  it: any,
  kind: CartItemKind,
  id: string | number,
  meta?: ItemMeta
): boolean {
  const itKind = String(it?.kind ?? "");
  const itId = String(it?.id ?? it?.product_id ?? it?.sku ?? "");

  const baseMatch = itKind === String(kind) && itId === String(id);
  if (!baseMatch) return false;

  // If no meta passed, match by kind+id only (legacy behavior)
  if (!meta) return true;

  // Only match on identifying fields (color/size variants)
  // This allows price changes without breaking item identity
  const colorMatch =
    (meta.colorVariantId ?? null) === (it?.colorVariantId ?? null);
  const sizeMatch =
    (meta.sizeVariantId ?? null) === (it?.sizeVariantId ?? null);

  return colorMatch && sizeMatch;
}

// Build a new cart item with meta spread in
function buildItem(
  kind: CartItemKind,
  id: string | number,
  qty: number,
  meta?: ItemMeta
): Record<string, unknown> {
  return {
    kind: String(kind),
    id: String(id),
    qty,
    quantity: qty,
    ...meta, // Spread all meta fields directly
  };
}

const hasMeta = (meta?: ItemMeta) => meta && Object.keys(meta).length > 0;

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MiniCartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const router = useRouter();

  // Load once from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      setCart(parseCart(raw));
    } catch (e) {
      console.error("Error loading cart:", e);
      setCart([]);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Persist on every change
  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CART_KEY, serialiseCart(cart));
    } catch (e) {
      console.error("Error saving cart:", e);
    }
  }, [cart, isLoaded]);

  // ── Auth state ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(!!data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const itemCount = useMemo(() => countItemsInCart(cart), [cart]);

  // ── getQty ───────────────────────────────────────────────────────────────
  const getQty = useCallback(
    (kind: CartItemKind, id: string | number, meta?: ItemMeta) => {
      const found = (cart as any[]).find((it) =>
        matchesItem(it, kind, id, meta)
      );
      return readQtyFromItem(found);
    },
    [cart]
  );

  // ── addItem ──────────────────────────────────────────────────────────────
  const addItem = useCallback(
    (
      kind: CartItemKind,
      id: string | number,
      quantityDelta = 1,
      meta?: ItemMeta
    ) => {
      // 🔒 AUTH GATE — redirect unauthenticated users to login
      if (!isAuthed) {
        router.push(`/auth/login?returnUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      if (!hasMeta(meta)) {
        // ── Legacy path — unchanged ──────────────────────────────────────
        setCart((prev) => addItemToCart(prev, kind, id, quantityDelta));
        return;
      }

      // ── Meta path ────────────────────────────────────────────────────
      setCart((prev: any[]) => {
        const idx = prev.findIndex((it) =>
          matchesItem(it, kind, id, meta)
        );

        if (idx !== -1) {
          // Line item exists — adjust quantity
          const newQty = Math.max(
            0,
            readQtyFromItem(prev[idx]) + quantityDelta
          );
          if (newQty === 0) {
            // Remove the line item
            return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          }
          // Keep existing item (with its meta) but update qty
          const updated = { ...prev[idx], qty: newQty, quantity: newQty };
          return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
        }

        // New line item — spread meta directly
        if (quantityDelta <= 0) return prev;
        return [...prev, buildItem(kind, id, quantityDelta, meta)];
      });
    },
    [isAuthed, router]
  );

  // ── clearCart ────────────────────────────────────────────────────────────
  const clearCart = useCallback(() => {
    setCart(clearCartHelper());
  }, []);

  // ── removeItem ───────────────────────────────────────────────────────────
  const removeItem = useCallback(
    (kind: CartItemKind, id: string | number, meta?: ItemMeta) => {
      if (!hasMeta(meta)) {
        // Legacy path
        setCart((prev: any) => {
          const found = (prev as any[]).find((it) =>
            matchesItem(it, kind, id)
          );
          const qty = readQtyFromItem(found);
          if (!qty) return prev;
          return addItemToCart(prev, kind, id, -qty);
        });
        return;
      }

      setCart((prev: any[]) => {
        const idx = prev.findIndex((it) =>
          matchesItem(it, kind, id, meta)
        );
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    },
    []
  );

  // ── setQty ───────────────────────────────────────────────────────────────
  const setQty = useCallback(
    (
      kind: CartItemKind,
      id: string | number,
      nextQty: number,
      meta?: ItemMeta
    ) => {
      const safeNext = Math.max(0, Math.floor(Number(nextQty) || 0));

      if (!hasMeta(meta)) {
        // Legacy path
        setCart((prev: any) => {
          const found = (prev as any[]).find((it) =>
            matchesItem(it, kind, id)
          );
          const current = readQtyFromItem(found);
          const delta = safeNext - current;
          if (delta === 0) return prev;
          return addItemToCart(prev, kind, id, delta);
        });
        return;
      }

      setCart((prev: any[]) => {
        const idx = prev.findIndex((it) =>
          matchesItem(it, kind, id, meta)
        );

        if (idx === -1) {
          if (safeNext <= 0) return prev;
          return [...prev, buildItem(kind, id, safeNext, meta)];
        }

        if (safeNext === 0) {
          return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        }

        const updated = {
          ...prev[idx],
          qty: safeNext,
          quantity: safeNext,
        };
        return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
      });
    },
    []
  );

  return (
    <MiniCartContext.Provider
      value={{
        cart,
        itemCount,
        isLoaded,
        isAuthed,
        addItem,
        clearCart,
        removeItem,
        setQty,
        getQty,
      }}
    >
      {children}
    </MiniCartContext.Provider>
  );
}

export function useMiniCart(): MiniCartContextType {
  const ctx = useContext(MiniCartContext);
  if (!ctx)
    throw new Error("useMiniCart must be used inside <MiniCartProvider>");
  return ctx;
}