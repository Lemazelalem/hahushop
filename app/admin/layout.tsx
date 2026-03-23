// app/admin/layout.tsx
"use client";

import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  // Prevent flash before auth initializes
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        await supabase.auth.getSession();
      } catch (e) {
        // ignore
      } finally {
        if (!alive) return;
        setReady(true);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen">
      {/* Keep your existing admin background system */}
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      {/* Page content only — NO sticky topbar */}
      <div className="px-4 pb-10">
        <div className="mx-auto max-w-6xl">
          {!ready ? (
            <div className="mt-4 glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
              Loading admin…
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
