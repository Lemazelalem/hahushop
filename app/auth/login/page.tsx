// app/auth/login/page.tsx
"use client";

import { FormEvent, Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getProfileRoleWithTimeout,
  getRoleHintFromUser,
  syncProfileFromAuthUser,
  type AppRole,
} from "@/lib/authProfile";

type ProfileRow = {
  role: AppRole;
};

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 🔒 Support both ?returnUrl= (from auth gate) and ?redirect= (legacy)
  const redirectTo =
    searchParams.get("returnUrl") || searchParams.get("redirect") || null;

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function finishLogin(path: string) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("shopease_is_logged_in", "1");
    }

    setLoading(false);
    router.replace(path);
    router.refresh();
  }

  useEffect(() => {
    if (error) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.email, formData.password]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.email) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      errors.password = "Password is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  function defaultPathForRole(
    profileRole: ProfileRow["role"],
    roleHint: ProfileRow["role"]
  ) {
    // 🔒 If a returnUrl or redirect was passed, always go there after login
    if (profileRole === "admin") return "/admin";
    if (profileRole === "seller") return "/seller";
    if (roleHint === "seller") return "/seller/verification";
    return "/";

  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: formData.email.trim(),
          password: formData.password,
        });

      console.log("[LOGIN] signIn result:", { signInData, signInError });

      if (signInError) {
        console.error("Sign in error:", signInError);

        if (signInError.message?.includes("Invalid login credentials")) {
          setError("Invalid email or password. Please try again.");
        } else if (signInError.message?.includes("Email not confirmed")) {
          setError("Please verify your email address before logging in.");
        } else {
          setError(signInError.message || "Could not sign in. Please try again.");
        }
        return;
      }

      const user = signInData.user ?? signInData.session?.user ?? null;

      if (!user) {
        setError("Could not load your session. Please try again.");
        return;
      }

      const roleHint = getRoleHintFromUser(user);

      void syncProfileFromAuthUser(supabase, user, roleHint).catch((profileErr) => {
        console.error("[LOGIN] profile bootstrap failed:", profileErr);
      });

      if (redirectTo && redirectTo !== "/seller" && redirectTo !== "/admin") {
        finishLogin(redirectTo);
        return;
      }

      const profileRole = await getProfileRoleWithTimeout(supabase, user.id);

      if (redirectTo === "/admin") {
        if (profileRole !== "admin") {
          setError("Your account does not have admin access.");
          return;
        }

        finishLogin("/admin");
        return;
      }

      if (redirectTo === "/seller") {
        if (profileRole === "seller") {
          finishLogin("/seller");
          return;
        }

        if (roleHint === "seller") {
          finishLogin("/seller/verification");
          return;
        }

        finishLogin("/");
        return;
      }

      finishLogin(defaultPathForRole(profileRole, roleHint));
    } catch (err) {
      console.error("Unexpected login error:", err);
      setError("An unexpected error occurred. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!formData.email) {
      setFieldErrors((prev) => ({
        ...prev,
        email: "Please enter your email first",
      }));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        formData.email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        }
      );

      if (error) {
        console.error("Forgot password error:", error);
        setError(error.message || "Could not send reset email. Please try again.");
      } else {
        setError(null);
        alert("Password reset instructions sent to your email!");
      }
    } catch (err) {
      console.error("Forgot password unexpected error:", err);
      setError("Could not send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const updateField = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value as never }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 relative overflow-hidden">
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center relative z-10">
        <div className="glass glass-card glow-green rounded-[24px] glass-ring w-full p-6 md:p-8 shadow-2xl">

          {/* Title */}
          <div className="mb-6 text-center">
            <div className="text-4xl mb-3 animate-pulse">🔐</div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back to HahuShop
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {redirectTo === "/public-employee"
                ? "Sign in to access your public employee deals."
                : "Sign in to continue shopping and manage your orders."}
            </p>
          </div>

          {/* Context banner for PE page */}
          {redirectTo === "/public-employee" && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
              <span className="text-2xl">🎖️</span>
              <div>
                <p className="text-xs font-bold text-amber-900">
                  Public Employee Access
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Sign in to view your exclusive discount pricing.
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                disabled={loading}
                className={`w-full rounded-2xl border bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:bg-white/90 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  fieldErrors.email
                    ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                    : "border-white/60 focus:border-lime-400 focus:ring-lime-200"
                }`}
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                onBlur={validateForm}
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                disabled={loading}
                className={`w-full rounded-2xl border bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:bg-white/90 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  fieldErrors.password
                    ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                    : "border-white/60 focus:border-lime-400 focus:ring-lime-200"
                }`}
                placeholder="Your password"
                value={formData.password}
                onChange={(e) => updateField("password", e.target.value)}
                onBlur={validateForm}
              />
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={loading}
                  className="rounded border-slate-300 text-lime-600 focus:ring-lime-500"
                  checked={formData.rememberMe}
                  onChange={(e) => updateField("rememberMe", e.target.checked)}
                />
                <span className="text-sm text-slate-700">Remember me</span>
              </label>

              <button
                type="button"
                disabled={loading}
                onClick={handleForgotPassword}
                className="text-sm text-cyan-700 hover:text-cyan-800 font-medium underline transition-colors disabled:opacity-60"
              >
                Forgot password?
              </button>
            </div>

            {/* Error banner */}
            {error && (
              <div className="rounded-2xl bg-red-50/90 border border-red-200 px-4 py-3 text-sm text-red-700 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">⚠️</span>
                  <span>{error}</span>
                </div>
                {error.includes("verify your email") && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!formData.email) return;
                      await supabase.auth.resend({
                        type: "signup",
                        email: formData.email.trim(),
                      });
                      setError("Verification email resent — check your inbox.");
                    }}
                    className="text-xs font-bold text-red-700 underline text-left"
                  >
                    Resend verification email →
                  </button>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`mt-2 w-full btn-cta rounded-full px-6 py-3 font-semibold text-slate-900 transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
                loading ? "opacity-70 cursor-not-allowed hover:scale-100" : "hover:shadow-lg"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-slate-600">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="underline font-semibold text-lime-700 hover:text-lime-800 transition-colors disabled:opacity-60"
              onClick={() => {
                const qs = redirectTo
                  ? `?redirect=${encodeURIComponent(redirectTo)}`
                  : "";
                router.push(`/auth/signup${qs}`);
              }}
              disabled={loading}
            >
              Create account
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
