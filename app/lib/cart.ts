// lib/cart.ts

export const CART_KEY = "shopease_cart_v2";

/**
 * One cart that can hold:
 * - Normal Supabase products     → kind: "approved"
 * - Public Employee products     → kind: "approved_public"
 * - Demo products                → kind: "demo"
 */

export type CartItemKind = "approved" | "approved_public" | "demo";

export interface CartItem {
  kind: CartItemKind;
  id: string;       // always stored as string
  quantity: number; // >= 1
}

export type Cart = CartItem[];

/* ---------------------- helpers ---------------------- */

export function parseCart(raw: string | null): Cart {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const result: Cart = [];

    for (const item of parsed) {
      if (!item) continue;

      // Support old shapes: { id, quantity } or { productId, qty } etc.
      const id =
        typeof item.id === "string"
          ? item.id
          : typeof item.id === "number"
          ? String(item.id)
          : typeof item.productId === "string"
          ? item.productId
          : typeof item.productId === "number"
          ? String(item.productId)
          : null;

      if (!id) continue;

      const quantityRaw =
        typeof item.quantity === "number"
          ? item.quantity
          : typeof item.qty === "number"
          ? item.qty
          : 1;

      const quantity =
        Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

      const kind: CartItemKind =
        item.kind === "demo" ||
        item.kind === "approved" ||
        item.kind === "approved_public"
          ? item.kind
          : guessKindFromId(id);

      result.push({ id, quantity, kind });
    }

    return result;
  } catch {
    return [];
  }
}

function guessKindFromId(id: string): CartItemKind {
  // If it looks like a uuid => approved (default).
  // (Public employee items must be explicitly added with kind: "approved_public".)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) ? "approved" : "demo";
}

export function serialiseCart(cart: Cart): string {
  return JSON.stringify(cart);
}

/**
 * Adds (or increments) an item in the cart.
 * - id can be string or number (we always convert to string)
 * - quantityDelta defaults to +1
 */
export function addItemToCart(
  cart: Cart,
  kind: CartItemKind,
  id: string | number,
  quantityDelta = 1
): Cart {
  const idStr = String(id);
  const next: Cart = [...cart];

  const index = next.findIndex(
    (item) => item.id === idStr && item.kind === kind
  );

  if (index === -1) {
    if (quantityDelta <= 0) return cart;
    next.push({ id: idStr, kind, quantity: quantityDelta });
  } else {
    const current = next[index];
    const newQty = current.quantity + quantityDelta;

    if (newQty <= 0) {
      next.splice(index, 1);
    } else {
      next[index] = { ...current, quantity: newQty };
    }
  }

  return next;
}

export function removeItemFromCart(
  cart: Cart,
  kind: CartItemKind,
  id: string | number
): Cart {
  const idStr = String(id);
  return cart.filter((item) => !(item.id === idStr && item.kind === kind));
}

export function clearCart(): Cart {
  return [];
}

/** Sum of quantities (not just distinct items). */
export function countItemsInCart(cart: Cart): number {
  return cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Approved (Supabase) ids only – includes BOTH normal + public employee items. */
export function getApprovedProductIds(cart: Cart): string[] {
  const ids = new Set<string>();
  for (const item of cart) {
    if (UUID_REGEX.test(item.id)) ids.add(item.id);
  }
  return Array.from(ids);
}

/**
 * Quantity lookup for Supabase products (by id) – sums BOTH approved + approved_public.
 * Great for "qty badges" on shop/product cards.
 */
export function getApprovedQuantities(cart: Cart): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of cart) {
    if (!UUID_REGEX.test(item.id)) continue;
    map[item.id] = (map[item.id] || 0) + (item.quantity || 0);
  }
  return map;
}

/** Demo items only (ids as stored in cart). */
export function getDemoItems(cart: Cart): Cart {
  return cart.filter((item) => item.kind === "demo");
}
