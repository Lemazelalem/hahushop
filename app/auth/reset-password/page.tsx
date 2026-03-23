"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function checkRecoveryState() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!alive) return;
        setHasRecoverySession(Boolean(session?.user));
      } catch {
        if (!alive) return;
        setHasRecoverySession(false);
      } finally {
        if (!alive) return;
        setCheckingLink(false);
      }
    }

    checkRecoveryState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;

      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasRecoverySession(Boolean(session?.user));
        setError(null);
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!hasRecoverySession) {
      setError("Reset link is invalid or expired. Please request a new one.");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError("Please fill in both password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || "Could not reset password. Please try again.");
        return;
      }

      setMessage("Password updated successfully. Redirecting to login...");

      setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 relative overflow-hidden">
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center relative z-10">
        <div className="glass glass-card glow-green rounded-[24px] glass-ring w-full p-6 md:p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="text-4xl mb-3">🔑</div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Reset your password
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Enter a new password for your account.
            </p>
          </div>

          {checkingLink ? (
            <div className="rounded-2xl bg-slate-50/90 border border-slate-200 px-4 py-3 text-sm text-slate-700">
              Validating reset link...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  New Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  disabled={loading || !hasRecoverySession}
                  className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:bg-white/90 focus:ring-2 focus:ring-lime-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Confirm New Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  disabled={loading || !hasRecoverySession}
                  className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:bg-white/90 focus:ring-2 focus:ring-lime-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-2xl bg-red-50/90 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {message && (
                <div className="rounded-2xl bg-emerald-50/90 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span>{message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !hasRecoverySession}
                className={`mt-2 w-full btn-cta rounded-full px-6 py-3 font-semibold text-slate-900 transition-all transform ${
                  loading || !hasRecoverySession
                    ? "opacity-70 cursor-not-allowed"
                    : "hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg"
                }`}
              >
                {loading ? "Updating password..." : "Update password"}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => router.push("/auth/login")}
                className="w-full rounded-full border border-slate-300 bg-white/70 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white disabled:opacity-60"
              >
                Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
