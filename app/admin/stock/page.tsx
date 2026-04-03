"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
  id: string;
  name: string;
  seller_id: string | null;
  status: string | null;
  is_active: boolean | null;
  stock_quantity: number | null;
  size_variants: Array<{ stock?: number | null }> | null;
  created_at: string | null;
};

type StockRow = {
  id: string;
  name: string;
  sellerId: string | null;
  sellerName: string;
  status: string;
  stock: number | null;
  createdAt: string | null;
  level: "out" | "low" | "ok" | "unknown";
};

function getProductStock(product: ProductRow) {
  if (Array.isArray(product.size_variants) && product.size_variants.length > 0) {
    return product.size_variants.reduce(
      (sum, variant) => sum + Math.max(0, Number(variant?.stock ?? 0)),
      0
    );
  }
  if (typeof product.stock_quantity === "number") {
    return Math.max(0, Number(product.stock_quantity));
  }
  return null;
}

export default function AdminStockPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [editStockById, setEditStockById] = useState<Record<string, string>>({});
  const [savingStockId, setSavingStockId] = useState<string | null>(null);

  const stockLevel = (stock: number | null): StockRow["level"] => {
    if (stock === null) return "unknown";
    if (stock <= 0) return "out";
    if (stock <= 5) return "low";
    return "ok";
  };

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        if (!user) {
          router.replace("/auth/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

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

  useEffect(() => {
    if (!isAdmin) return;

    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const { data: products, error: productErr } = await supabase
          .from("products")
          .select("id, name, seller_id, status, is_active, stock_quantity, size_variants, created_at")
          .order("created_at", { ascending: false });

        if (productErr) throw productErr;

        const list = (products ?? []) as ProductRow[];
        const sellerIds = Array.from(
          new Set(list.map((p) => p.seller_id).filter((s): s is string => Boolean(s)))
        );

        const sellerNameMap = new Map<string, string>();
        if (sellerIds.length > 0) {
          const idsParam = encodeURIComponent(sellerIds.join(","));
          const res = await fetch(`/api/admin/profiles?ids=${idsParam}`);
          if (res.ok) {
            const json = await res.json();
            const profiles = (json.profiles ?? []) as Array<{ id: string; display_name: string | null; full_name: string | null }>;
            for (const p of profiles) {
              sellerNameMap.set(p.id, p.display_name ?? p.full_name ?? "Unknown seller");
            }
          }
        }

        const mapped: StockRow[] = list.map((p) => {
          const stock = getProductStock(p);
          const level: "out" | "low" | "ok" | "unknown" =
            stock === null ? "unknown" : stock <= 0 ? "out" : stock <= 5 ? "low" : "ok";
          return {
            id: p.id,
            name: p.name ?? "Untitled",
            sellerId: p.seller_id,
            sellerName: p.seller_id ? sellerNameMap.get(p.seller_id) ?? "Unknown seller" : "No seller",
            status: p.status ?? "unknown",
            stock,
            createdAt: p.created_at,
            level,
          };
        });

        mapped.sort((a, b) => {
          const rank: Record<StockRow["level"], number> = {
            out: 0,
            low: 1,
            ok: 2,
            unknown: 3,
          };
          const aStock = a.stock ?? Number.MAX_SAFE_INTEGER;
          const bStock = b.stock ?? Number.MAX_SAFE_INTEGER;
          return rank[a.level] - rank[b.level] || aStock - bStock;
        });

        if (alive) setRows(mapped);
        if (alive) {
          const draft: Record<string, string> = {};
          mapped.forEach((r) => {
            draft[r.id] = r.stock === null ? "" : String(r.stock);
          });
          setEditStockById(draft);
        }
      } catch (err: any) {
        console.error("[admin stock] load error:", err);
        if (alive) {
          setErrorMsg(err?.message || "Failed to load stock table.");
          setRows([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  async function handleSaveStock(row: StockRow) {
    const raw = editStockById[row.id] ?? "";
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      setErrorMsg("Stock must be a non-negative number.");
      return;
    }

    try {
      setSavingStockId(row.id);
      setErrorMsg(null);

      const { error } = await supabase
        .from("products")
        .update({
          stock_quantity: Math.floor(parsed),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (error) throw error;

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                stock: Math.floor(parsed),
                level: stockLevel(Math.floor(parsed)),
              }
            : r
        )
      );
    } catch (err: any) {
      console.error("[admin stock] save error:", err);
      setErrorMsg(err?.message || "Failed to save stock.");
    } finally {
      setSavingStockId(null);
    }
  }

  const totals = useMemo(() => {
    const out = rows.filter((r) => r.level === "out").length;
    const low = rows.filter((r) => r.level === "low").length;
    const ok = rows.filter((r) => r.level === "ok").length;
    const unknown = rows.filter((r) => r.level === "unknown").length;
    return { out, low, ok, unknown };
  }, [rows]);

  if (checking) {
    return (
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">Checking admin access...</div>
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="py-4 md:py-6 space-y-6">
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Admin</div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">Stock Table</h1>
            <p className="text-sm text-slate-700 mt-1">Track product stock levels across sellers. Click any product row to open details.</p>
          </div>

          <button
            onClick={() => router.push("/admin")}
            className="pill px-5 py-2 text-sm font-semibold text-slate-900"
          >
            ← Back to Admin Dashboard
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <div className="text-xs text-rose-700 font-semibold uppercase">Out of stock</div>
            <div className="text-xl font-bold text-rose-900">{totals.out}</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs text-amber-700 font-semibold uppercase">Low stock</div>
            <div className="text-xl font-bold text-amber-900">{totals.low}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs text-emerald-700 font-semibold uppercase">Healthy</div>
            <div className="text-xl font-bold text-emerald-900">{totals.ok}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-600 font-semibold uppercase">Unknown stock</div>
            <div className="text-xl font-bold text-slate-800">{totals.unknown}</div>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="glass glass-ring rounded-[20px] p-4 border border-rose-200 bg-rose-50/80 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      <section className="glass glass-ring rounded-[28px] p-4 md:p-6 overflow-x-auto">
        {loading ? (
          <div className="text-sm text-slate-700">Loading stock table...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-600">No products found.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b border-slate-200">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Seller</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Stock Left</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Edit Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/products/${r.id}`)}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  title="Open product details"
                >
                  <td className="py-3 pr-4 font-semibold text-slate-900">{r.name}</td>
                  <td className="py-3 pr-4 text-slate-700">{r.sellerName}</td>
                  <td className="py-3 pr-4 text-slate-600">{r.status}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.level === "out"
                          ? "bg-rose-100 text-rose-700"
                          : r.level === "low"
                          ? "bg-amber-100 text-amber-700"
                          : r.level === "unknown"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {r.stock === null ? "—" : r.stock}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-"}
                  </td>
                  <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={editStockById[r.id] ?? ""}
                        onChange={(e) =>
                          setEditStockById((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                        placeholder="stock"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveStock(r);
                        }}
                        disabled={savingStockId === r.id}
                        className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {savingStockId === r.id ? "Saving..." : "Save"}
                      </button>
                    </div>
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
