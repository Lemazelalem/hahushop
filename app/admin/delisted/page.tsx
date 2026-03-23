// app/admin/delisted/page.tsx
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
  category: string | null;
  created_at: string | null;
};

function money(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "-";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminDelistedProductsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // AUTH
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

  // LOAD DELISTED
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setPageError(null);

        const { data, error } = await supabase
          .from("products")
          .select("id, name, status, is_active, final_price_cents, category, created_at")
          .or("status.eq.delisted,is_active.eq.false")
          .order("created_at", { ascending: false });

        if (!alive) return;

        if (error) {
          console.error("[admin/delisted] load error:", error);
          setPageError(error.message || "Could not load delisted products.");
          setProducts([]);
          return;
        }

        const rows: ProductRow[] = (data ?? []).map((row: any) => ({
          id: row.id as string,
          name: (row.name as string) ?? "",
          status: (row.status as ProductStatus) ?? "delisted",
          is_active:
            typeof row.is_active === "boolean" ? row.is_active : false,
          final_price_cents:
            (row.final_price_cents as number | null) ?? null,
          category: (row.category as string | null) ?? null,
          created_at: (row.created_at as string | null) ?? null,
        }));

        setProducts(rows);
      } catch (err) {
        console.error("[admin/delisted] unexpected error:", err);
        if (!alive) return;
        setPageError("Unexpected error while loading delisted products.");
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

  if (checking) {
    return (
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Loading delisted products…
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
              Delisted Products
            </h1>
            <p className="text-sm text-slate-700 mt-1 max-w-2xl">
              These products are currently removed from the public shop (status{" "}
              <span className="font-semibold">delisted</span> or{" "}
              <span className="font-semibold">is_active = false</span>).
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

      {/* ERROR */}
      {pageError && (
        <div className="glass glass-ring rounded-[20px] p-4 border border-rose-200 bg-rose-50/80 text-sm text-rose-800">
          {pageError}
        </div>
      )}

      {/* LIST */}
      <section className="glass glass-ring rounded-[28px] p-4 md:p-6 overflow-x-auto">
        {loading ? (
          <div className="text-sm text-slate-700">
            Loading delisted products…
          </div>
        ) : products.length === 0 ? (
          <div className="text-sm text-slate-700">
            No delisted products right now.
          </div>
        ) : (
          <table className="min-w-full text-sm text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200/60">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 px-4">Category</th>
                <th className="py-2 px-4 text-right">Price</th>
                <th className="py-2 px-4 text-center">Status</th>
                <th className="py-2 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
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
                  <td className="py-3 px-4 align-middle text-right text-slate-900 font-semibold">
                    {money(p.final_price_cents)}
                  </td>
                  <td className="py-3 px-4 align-middle text-center">
                    <span className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
                      Delisted
                    </span>
                  </td>
                  <td className="py-3 px-4 align-middle text-slate-600 text-xs">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
