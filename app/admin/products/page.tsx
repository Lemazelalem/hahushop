// app/admin/products/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProductStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "archived"
  | "delisted"
  | string;

type ProductRow = {
  id: string;
  name: string;
  status: ProductStatus;
  is_active: boolean | null;
  final_price_cents: number | null;
  public_employee_price_cents: number | null;
  category: string | null;
  created_at: string | null;
  seller_name: string | null;
};

function money(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "-";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminProductsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // ------------------------------
  // AUTH + ROLE CHECK
  // ------------------------------
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (error || !data || data.role !== "admin") {
          router.replace("/");
          return;
        }

        if (alive) setIsAdmin(true);
      } finally {
        if (alive) setChecking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [router]);

  // ------------------------------
  // LOAD PRODUCTS
  // ------------------------------
  useEffect(() => {
    if (!isAdmin) return;

    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setPageError(null);

        const { data, error } = await supabase
          .from("products")
          .select(
            `
            id,
            name,
            status,
            is_active,
            final_price_cents,
            public_employee_price_cents,
            category,
            created_at,
            seller:profiles(display_name)
          `
          )
          .order("created_at", { ascending: false });

        if (!alive) return;

        if (error) {
          console.error("[admin/products] load error:", error);
          setPageError(error.message || "Could not load products.");
          setProducts([]);
          return;
        }

        const rows: ProductRow[] = (data ?? []).map((row: any) => ({
          id: row.id as string,
          name: (row.name as string) ?? "",
          status: (row.status as ProductStatus) ?? "draft",
          is_active:
            typeof row.is_active === "boolean" ? row.is_active : true,
          final_price_cents:
            (row.final_price_cents as number | null) ?? null,
          public_employee_price_cents:
            (row.public_employee_price_cents as number | null) ?? null,
          category: (row.category as string | null) ?? null,
          created_at: (row.created_at as string | null) ?? null,
          seller_name:
            (row.seller?.display_name as string | null) ?? "Unknown seller",
        }));

        setProducts(rows);
      } catch (err) {
        console.error("[admin/products] unexpected error:", err);
        if (!alive) return;
        setPageError("Unexpected error while loading products.");
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
  }, [isAdmin]);

  // ------------------------------
  // DELIST / RELIST ACTIONS
  // ------------------------------
  async function handleToggle(p: ProductRow) {
    setActionError(null);

    // Decide which way to toggle
    const currentlyDelisted =
      p.status === "delisted" || p.is_active === false;

    const nextStatus: ProductStatus = currentlyDelisted
      ? "approved"
      : "delisted";
    const nextActive = currentlyDelisted ? true : false;

    try {
      setSavingId(p.id);

      const { data, error } = await supabase
        .from("products")
        .update({
          status: nextStatus,
          is_active: nextActive,
        })
        .eq("id", p.id)
        .select()
        .single();

      if (error) {
        console.error("[admin/products] toggle error:", error);
        setActionError(
          error.message ||
            "Failed to update product. Check RLS policies in Supabase."
        );
        return;
      }

      // Update local state with returned row
      setProducts((prev) =>
        prev.map((row) =>
          row.id === p.id
            ? {
                ...row,
                status: (data as any).status as ProductStatus,
                is_active:
                  (data as any).is_active ??
                  row.is_active,
              }
            : row
        )
      );
    } catch (err: any) {
      console.error("[admin/products] toggle error:", err);
      setActionError(
        err?.message ||
          "Unexpected error while updating product."
      );
    } finally {
      setSavingId(null);
    }
  }

  // ------------------------------
  // RENDER
  // ------------------------------
  if (checking) {
    return (
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Loading admin products…
        </div>
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="py-4 md:py-6 space-y-6">
      {/* HEADER */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              Admin
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">
              Products (Delist Control)
            </h1>
            <p className="text-sm text-slate-700 mt-1 max-w-2xl">
              View approved products and manually delist them from the
              public shop, or relist previously delisted items.
            </p>
          </div>

          <button
            onClick={() => router.push("/admin")}
            className="pill px-5 py-2 text-sm font-semibold text-slate-900"
          >
            ← Back to Admin Dashboard
          </button>
        </div>
      </section>

      {/* ERRORS */}
      {pageError && (
        <div className="glass glass-ring rounded-[20px] p-4 border border-rose-200 bg-rose-50/80 text-sm text-rose-800">
          {pageError}
        </div>
      )}
      {actionError && (
        <div className="glass glass-ring rounded-[20px] p-4 border border-amber-200 bg-amber-50/90 text-sm text-amber-900">
          {actionError}
        </div>
      )}

      {/* TABLE */}
      <section className="glass glass-ring rounded-[28px] p-4 md:p-6 overflow-x-auto">
        {loading ? (
          <div className="text-sm text-slate-700">
            Loading products…
          </div>
        ) : products.length === 0 ? (
          <div className="text-sm text-slate-700">
            No products found.
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200/60">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 px-4">Category</th>
                <th className="py-2 px-4">Seller</th>
                <th className="py-2 px-4 text-right">Price</th>
                <th className="py-2 px-4 text-right">
                  Public Employee
                </th>
                <th className="py-2 px-4 text-center">Status</th>
                <th className="py-2 pl-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isDelisted =
                  p.status === "delisted" || p.is_active === false;
                const isApprovedActive =
                  p.status === "approved" && p.is_active !== false;

                let statusBadge =
                  "bg-slate-100 text-slate-700 border-slate-200";
                if (isApprovedActive)
                  statusBadge =
                    "bg-emerald-50 text-emerald-700 border-emerald-200";
                else if (p.status === "submitted")
                  statusBadge =
                    "bg-amber-50 text-amber-700 border-amber-200";
                else if (p.status === "rejected")
                  statusBadge =
                    "bg-rose-50 text-rose-700 border-rose-200";
                else if (isDelisted)
                  statusBadge =
                    "bg-amber-50 text-amber-800 border-amber-300";

                return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100/70 last:border-none"
                  >
                    <td className="py-3 pr-4 align-middle">
                      <div className="font-semibold text-slate-900">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {p.id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="py-3 px-4 align-middle text-slate-700">
                      {p.category || "—"}
                    </td>
                    <td className="py-3 px-4 align-middle text-slate-700">
                      {p.seller_name || "—"}
                    </td>
                    <td className="py-3 px-4 align-middle text-right text-slate-900 font-semibold">
                      {money(p.final_price_cents)}
                    </td>
                    <td className="py-3 px-4 align-middle text-right text-slate-700">
                      {money(p.public_employee_price_cents)}
                    </td>
                    <td className="py-3 px-4 align-middle text-center">
                      <span
                        className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusBadge}`}
                      >
                        {isDelisted
                          ? "Delisted"
                          : p.status.charAt(0).toUpperCase() +
                            p.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 pl-4 align-middle text-center">
                      {isApprovedActive || isDelisted ? (
                        <button
                          onClick={() => handleToggle(p)}
                          disabled={savingId === p.id}
                          className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold shadow-sm transition-all ${
                            isDelisted
                              ? "bg-emerald-600 text-white hover:bg-emerald-500"
                              : "bg-amber-500 text-white hover:bg-amber-400"
                          } ${
                            savingId === p.id
                              ? "opacity-60 cursor-wait"
                              : "cursor-pointer"
                          }`}
                        >
                          {savingId === p.id
                            ? "Saving…"
                            : isDelisted
                            ? "Relist to Shop"
                            : "Delist from Shop"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          No action
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
