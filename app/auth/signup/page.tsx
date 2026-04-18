// app/auth/signup/page.tsx
"use client";

import { FormEvent, Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { syncProfileFromAuthUser } from "@/lib/authProfile";
import { Store, User, ArrowLeft, CheckCircle, Eye, EyeOff } from "lucide-react";

type SignupRole = "customer" | "seller";

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // FIX: read ?redirect= so we can carry it through to login after signup
  const redirectTo = searchParams.get("redirect") || null;
  const sellerIntent = redirectTo === "/seller";

  const [step, setStep] = useState<"role" | "form" | "verify">("role");
  const [selectedRole, setSelectedRole] = useState<SignupRole>("customer");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
    businessName: "",
  });
  const [signedUpEmail, setSignedUpEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // If user is already logged in and wants to sell, redirect to verification
  useEffect(() => {
    if (!sellerIntent) return;
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive || !session?.user) return;
      // Already logged in — go directly to seller verification
      router.replace("/seller/verification");
    })();
    return () => { alive = false; };
  }, [sellerIntent, router]);

  function finishSignedInSignup(path: string) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("shopease_is_logged_in", "1");
    }

    setLoading(false);
    router.replace(path);
    router.refresh();
  }

  // FIX: removed error/message from deps — setting them inside the effect
  // caused an unnecessary re-run cycle on every render.
  useEffect(() => {
    setError(null);
    setMessage(null);
  }, [formData]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.email) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      errors.password = "Password is required";
    } else if (formData.password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (selectedRole === "seller" && !formData.businessName.trim()) {
      errors.businessName = "Business name is required for sellers";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Helper: build the login URL, carrying ?redirect= if present
  function loginUrl() {
    const qs = redirectTo
      ? `?redirect=${encodeURIComponent(redirectTo)}`
      : "";
    return `/auth/login${qs}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      const email = formData.email.trim();
      const displayName =
        formData.displayName.trim() || formData.businessName.trim();
      const businessName = formData.businessName.trim();

      // 1) Sign up user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            display_name: displayName,
            business_name: businessName || undefined,
            role: selectedRole,
          },
        },
      });

      if (signUpError) {
        console.error("Sign up error:", signUpError);
        setError(
          signUpError.message || "Could not create account. Please try again."
        );
        return;
      }

      const signedUpUser = data.user ?? data.session?.user ?? null;
      if (!signedUpUser) {
        setError(
          "Account created but user ID not found. Please contact support."
        );
        return;
      }

      // Detect existing user (Supabase returns user with empty identities)
      const isExistingUser =
        signedUpUser.identities && signedUpUser.identities.length === 0;

      if (isExistingUser && selectedRole === "seller") {
        // Existing customer upgrading to seller — sign them in instead
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password: formData.password,
          });

        if (signInError) {
          setError(
            "An account with this email already exists. Please log in with the correct password, then apply as seller."
          );
          return;
        }

        const existingUser = signInData.user ?? signInData.session?.user;
        if (!existingUser) {
          setError("Could not load your session. Please try again.");
          return;
        }

        // Update profile for seller application (keep existing role — admin will promote)
        await supabase
          .from("profiles")
          .update({
            business_name: formData.businessName.trim(),
            seller_status: "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingUser.id);

        // Update user metadata so login/callback know they applied as seller
        await supabase.auth.updateUser({
          data: {
            role: "seller",
            business_name: formData.businessName.trim(),
          },
        });

        // Create seller application
        await supabase.from("seller_applications").insert({
          user_id: existingUser.id,
          business_name: formData.businessName.trim(),
          status: "pending",
          applied_at: new Date().toISOString(),
        });

        finishSignedInSignup("/seller/verification");
        return;
      }

      // 2) Update profile row (assuming row exists via trigger)
      // NOTE: Don't set role to "seller" — admin approval is required.
      if (data.session?.user) {
        const profileUpdate: Record<string, unknown> = {
          display_name:
            formData.displayName.trim() || formData.businessName.trim(),
          updated_at: new Date().toISOString(),
        };

        if (selectedRole === "seller") {
          profileUpdate.business_name = formData.businessName.trim();
          profileUpdate.seller_status = "pending";
          profileUpdate.is_verified_seller = false;
        } else {
          profileUpdate.role = selectedRole;
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .update(profileUpdate)
          .eq("id", signedUpUser.id);

        if (profileError) {
          console.error("Profile update error:", profileError);
          // Non-blocking — log but continue
        }

        // 3) Create seller application if seller
        if (selectedRole === "seller") {
          const { error: sellerAppError } = await supabase
            .from("seller_applications")
            .insert({
              user_id: signedUpUser.id,
              business_name: formData.businessName.trim(),
              status: "pending",
              applied_at: new Date().toISOString(),
            });

          if (sellerAppError) {
            console.error("Seller application error:", sellerAppError);
          }
        }

        // 4) Success — move to verify step with the submitted email
      }

      setSignedUpEmail(email);
      setFormData({
        email: "",
        password: "",
        confirmPassword: "",
        displayName: "",
        businessName: "",
      });

      if (!data.session?.user) {
        setStep("verify");
        return;
      }

      try {
        // For seller: only bootstrap profile (without role) + create application
        // Admin approval is required to get seller role
        await syncProfileFromAuthUser(
          supabase,
          signedUpUser,
          selectedRole === "seller" ? null : selectedRole
        );
        // Ensure seller application exists for email-confirm flow
        if (selectedRole === "seller") {
          await supabase.from("seller_applications").insert({
            user_id: signedUpUser.id,
            business_name: formData.businessName.trim() || signedUpUser.user_metadata?.business_name || "Seller",
            status: "pending",
            applied_at: new Date().toISOString(),
          });
        }
      } catch (profileErr) {
        console.error("[SIGNUP] profile bootstrap failed:", profileErr);
      }

      if (selectedRole === "seller") {
        finishSignedInSignup("/seller/verification");
        return;
      }

      finishSignedInSignup(
        redirectTo && redirectTo !== "/seller" ? redirectTo : "/"
      );
      return;
    } catch (err) {
      console.error("Unexpected signup error:", err);
      setError("An unexpected error occurred. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  /* -------------------- STEP 1: ROLE SELECTION -------------------- */

  if (step === "role") {
    return (
      <main className="min-h-screen px-4 py-6 md:px-10 relative overflow-hidden">
        <div className="bg-scene" />
        <div className="bg-vignette" />
        <div className="sparkles" />

        <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center relative z-10">
          <div className="glass glass-card rounded-[24px] glass-ring w-full p-8 md:p-10 shadow-2xl">
            <div className="text-center mb-8">
              <div className="text-4xl mb-3">🛍️</div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                Join HahuShop
              </h1>
              <p className="mt-2 text-slate-600">
                {sellerIntent
                  ? "Set up your seller account"
                  : "How would you like to use HahuShop?"}
              </p>
            </div>

            <div className={`grid gap-4 ${sellerIntent ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
              {!sellerIntent && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole("customer");
                    setStep("form");
                  }}
                  className="group relative p-6 rounded-2xl border-2 border-slate-200 hover:border-cyan-400 bg-white/50 hover:bg-white/80 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <User className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    I want to shop
                  </h3>
                  <p className="text-sm text-slate-600">
                    Browse products, place orders, and track deliveries as a
                    customer.
                  </p>
                  <div className="mt-4 flex items-center text-cyan-600 font-semibold text-sm">
                    Continue as Customer
                    <ArrowLeft className="w-4 h-4 ml-1 rotate-180" />
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedRole("seller");
                  setStep("form");
                }}
                className="group relative p-6 rounded-2xl border-2 border-slate-200 hover:border-lime-400 bg-white/50 hover:bg-white/80 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-lime-100 text-lime-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Store className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  I want to sell
                </h3>
                <p className="text-sm text-slate-600">
                  List your products, manage inventory, and grow your business.
                </p>
                <div className="mt-4 flex items-center text-lime-600 font-semibold text-sm">
                  Register as Seller
                  <ArrowLeft className="w-4 h-4 ml-1 rotate-180" />
                </div>
              </button>
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm text-slate-600">
                Already have an account?{" "}
                {/* FIX: carry ?redirect= through to login */}
                <button
                  type="button"
                  className="underline font-semibold text-cyan-700 hover:text-cyan-800"
                  onClick={() => router.push(loginUrl())}
                >
                  Log in
                </button>
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (step === "verify") {
    return (
      <main className="min-h-screen px-4 py-6 md:px-10 relative overflow-hidden">
        <div className="bg-scene" />
        <div className="bg-vignette" />
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center relative z-10">
          <div className="glass glass-card rounded-[24px] glass-ring w-full p-8 shadow-2xl text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-blue-100 flex items-center justify-center text-4xl mb-5">
              📧
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Check your email
            </h1>
            <p className="text-sm text-slate-600 mb-2">
              We sent a verification link to:
            </p>
            <p className="text-sm font-bold text-slate-900 mb-6 bg-slate-100 px-4 py-2 rounded-xl">
              {signedUpEmail}
            </p>
            <p className="text-xs text-slate-500 mb-8">
              Click the link in the email to verify your account before logging in. Check your spam folder if you do not see it.
            </p>

            <button
              onClick={async () => {
                if (resendCooldown > 0) return;
                try {
                  await supabase.auth.resend({
                    type: "signup",
                    email: signedUpEmail,
                  });
                  setResendCooldown(60);
                  const interval = setInterval(() => {
                    setResendCooldown((prev) => {
                      if (prev <= 1) {
                        clearInterval(interval);
                        return 0;
                      }
                      return prev - 1;
                    });
                  }, 1000);
                } catch (err) {
                  console.error("Resend error:", err);
                }
              }}
              disabled={resendCooldown > 0}
              className="w-full py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-bold text-sm hover:border-slate-300 transition-colors disabled:opacity-50 mb-4"
            >
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend verification email"}
            </button>

            <button
              onClick={() => router.push(loginUrl())}
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-colors"
            >
              Go to login
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* -------------------- STEP 2: SIGNUP FORM -------------------- */

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 relative overflow-hidden">
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center relative z-10">
        <div
          className={`glass glass-card rounded-[24px] glass-ring w-full p-6 md:p-8 shadow-2xl ${
            selectedRole === "seller" ? "glow-lime" : "glow-blue"
          }`}
        >
          <button
            type="button"
            onClick={() => setStep("role")}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="mb-6 text-center">
            <div
              className={`w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center ${
                selectedRole === "seller"
                  ? "bg-lime-100 text-lime-600"
                  : "bg-cyan-100 text-cyan-600"
              }`}
            >
              {selectedRole === "seller" ? (
                <Store className="w-6 h-6" />
              ) : (
                <User className="w-6 h-6" />
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Create {selectedRole === "seller" ? "Seller" : "Customer"} Account
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {selectedRole === "seller"
                ? "Start selling on HahuShop Ethiopia"
                : "Start shopping on HahuShop Ethiopia"}
            </p>
          </div>

          {selectedRole === "seller" && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-800 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Seller accounts require admin approval before you can start
                listing products.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {selectedRole === "seller" && (
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  disabled={loading}
                  className={`w-full rounded-2xl border bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:bg-white/90 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    fieldErrors.businessName
                      ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                      : "border-white/60 focus:border-lime-400 focus:ring-lime-200"
                  }`}
                  placeholder="Your business or store name"
                  value={formData.businessName}
                  onChange={(e) => updateField("businessName", e.target.value)}
                />
                {fieldErrors.businessName && (
                  <p className="mt-1 text-xs text-red-600 font-medium">
                    {fieldErrors.businessName}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                {selectedRole === "seller" ? "Contact Person" : "Display Name"}
                <span className="text-slate-400 font-normal"> (optional)</span>
              </label>
              <input
                type="text"
                disabled={loading}
                className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-cyan-400 focus:bg-white/90 focus:ring-2 focus:ring-cyan-200 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={
                  selectedRole === "seller"
                    ? "Your full name"
                    : "How you want to appear"
                }
                value={formData.displayName}
                onChange={(e) => updateField("displayName", e.target.value)}
              />
            </div>

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
                    : "border-white/60 focus:border-cyan-400 focus:ring-cyan-200"
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

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  disabled={loading}
                  className={`w-full rounded-2xl border bg-white/70 px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none transition-all focus:bg-white/90 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    fieldErrors.password
                      ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                      : "border-white/60 focus:border-cyan-400 focus:ring-cyan-200"
                  }`}
                  placeholder="At least 6 characters"
                  value={formData.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  onBlur={validateForm}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  {fieldErrors.password}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Must be at least 8 characters long
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  disabled={loading}
                  className={`w-full rounded-2xl border bg-white/70 px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none transition-all focus:bg-white/90 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    fieldErrors.confirmPassword
                      ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                      : "border-white/60 focus:border-cyan-400 focus:ring-cyan-200"
                  }`}
                  placeholder="Re-enter your password"
                  value={formData.confirmPassword}
                  onChange={(e) => updateField("confirmPassword", e.target.value)}
                  onBlur={validateForm}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-2xl bg-red-50/90 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2 animate-pulse">
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
              disabled={loading}
              className={`mt-2 w-full btn-cta rounded-full px-6 py-3 font-semibold text-slate-900 transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
                loading ? "opacity-70 cursor-not-allowed" : "hover:shadow-lg"
              } ${
                selectedRole === "seller"
                  ? "bg-gradient-to-r from-lime-400 to-green-400"
                  : ""
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
                  Creating account...
                </span>
              ) : (
                `Create ${selectedRole === "seller" ? "Seller" : ""} Account`
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            {/* FIX: carry ?redirect= through to login */}
            <button
              type="button"
              className="underline font-semibold text-cyan-700 hover:text-cyan-800 transition-colors"
              onClick={() => router.push(loginUrl())}
              disabled={loading}
            >
              Log in
            </button>
          </div>
        </div>
      </div>
    </main>
  );

}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
