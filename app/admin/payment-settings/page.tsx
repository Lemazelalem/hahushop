// app/admin/payment-settings/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AdminPaymentSettingsPage() {
  const router = useRouter();
  const mountedRef = useRef(true);

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bankTitle, setBankTitle] = useState("");
  const [bankInstructions, setBankInstructions] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Track mount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------------------------------
  // AUTH + ROLE CHECK (admin)
  // ------------------------------
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error("[admin payment-settings] session error:", sessionError);
          if (mountedRef.current) router.replace("/login");
          return;
        }

        const user = sess.session?.user;
        if (!user) {
          if (mountedRef.current) router.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error(
            "[admin payment-settings] profile fetch error:",
            error
          );
          if (mountedRef.current) router.replace("/");
          return;
        }

        if (!data || data.role !== "admin") {
          if (mountedRef.current) router.replace("/");
          return;
        }

        if (alive && mountedRef.current) {
          setIsAdmin(true);
        }
      } finally {
        if (alive && mountedRef.current) {
          setChecking(false);
        }
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [router]);

  // ------------------------------
  // LOAD EXISTING PAYMENT SETTINGS
  // ------------------------------
  useEffect(() => {
    if (!isAdmin) return;

    let alive = true;

    async function loadSettings() {
      if (mountedRef.current) {
        setLoading(true);
        setErrorMsg(null);
        setSuccessMsg(null);
      }

      try {
        const { data, error } = await supabase
          .from("payment_settings")
          .select("id, bank_title, bank_instructions")
          .eq("id", 1)
          .maybeSingle();

        if (!alive || !mountedRef.current) return;

        if (error && error.code !== "PGRST116") {
          // PGRST116 = no rows (in newer PostgREST); ignore that
          console.error("[admin payment-settings] load error:", error);
          setErrorMsg("Failed to load payment settings.");
        } else if (data) {
          setBankTitle(data.bank_title ?? "");
          setBankInstructions(data.bank_instructions ?? "");
          setErrorMsg(null);
        } else {
          // no row yet: keep blanks
          setErrorMsg(null);
        }
      } catch (e) {
        if (!alive || !mountedRef.current) return;
        console.error("[admin payment-settings] unexpected load error:", e);
        setErrorMsg("Failed to load payment settings.");
      } finally {
        if (alive && mountedRef.current) {
          setLoading(false);
        }
      }
    }

    loadSettings();
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  // ------------------------------
  // SAVE / UPSERT SETTINGS
  // ------------------------------
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        setErrorMsg("You must be signed in as admin.");
        setSaving(false);
        return;
      }

      const { error } = await supabase.from("payment_settings").upsert(
        {
          id: 1,
          bank_title: bankTitle.trim() || null,
          bank_instructions: bankInstructions.trim() || null,
          updated_by: userData.user.id,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error("[admin payment-settings] save error:", error);
        setErrorMsg("Failed to save payment settings.");
        setSaving(false);
        return;
      }

      setSuccessMsg("Payment settings saved.");
    } catch (err) {
      console.error("[admin payment-settings] unexpected save error:", err);
      setErrorMsg("Unexpected error while saving settings.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  // ------------------------------
  // LOADING / GUARD
  // ------------------------------
  if (checking) {
    return (
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Checking admin access…
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return null;
  }

  // ------------------------------
  // MAIN UI
  // ------------------------------
  return (
    <main className="py-4 md:py-6 space-y-6">
      {/* HEADER CARD */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              Admin
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mt-1">
              Payment Settings
            </h1>
            <p className="text-sm md:text-base text-slate-700 mt-1">
              Set the bank transfer details customers will see at checkout.
            </p>
          </div>

          <button
            onClick={() => router.push("/admin")}
            className="pill px-5 py-2 text-sm font-semibold text-slate-900"
          >
            ← Back to Admin
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            {successMsg}
          </div>
        )}
      </section>

      {/* FORM CARD */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        {loading ? (
          <div className="text-sm text-slate-700">Loading settings…</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Bank title (internal + customer label)
              </label>
              <input
                type="text"
                value={bankTitle}
                onChange={(e) => setBankTitle(e.target.value)}
                placeholder="Example: CBE Main Account"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Shown on the checkout confirmation as the bank name.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Bank transfer instructions
              </label>
              <textarea
                value={bankInstructions}
                onChange={(e) => setBankInstructions(e.target.value)}
                rows={6}
                placeholder={`Example:
Bank: Commercial Bank of Ethiopia
Account name: HahuShop Ethiopia PLC
Account number: 1000 1234 5678
Note: Use your Order ID as the payment reference.`}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400 resize-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                This full text will be shown to customers who choose{" "}
                <span className="font-semibold">Bank Transfer</span>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setBankTitle("");
                  setBankInstructions("");
                  setSuccessMsg(null);
                }}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}