"use client";

import { FormEvent, Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// ── NEW: added "conflict" for the business account wall ──
type Step = "checking" | "signup" | "upload" | "success" | "conflict";

function PublicEmployeeSignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const productId = searchParams.get("product_id");
  const redirect = searchParams.get("redirect") || "/public-employee";
  const forceStep = searchParams.get("step");

  const [step, setStep] = useState<Step>("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [employer, setEmployer] = useState("");
  const [email, setEmail] = useState("");

  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Cleanup object URLs to prevent memory leaks ──
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // ── On mount: check session, business conflict, and existing doc status ──
  useEffect(() => {
    async function checkSession() {
      try {
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();

        if (authErr) {
          console.error("[PE signup] Auth error:", authErr);
          setStep("signup");
          return;
        }

        if (!user) {
          setStep("signup");
          return;
        }

        setUserId(user.id);
        setEmail(user.email ?? "");

        // ── Fetch profile (includes is_business_account) + latest PE doc ──
        const [{ data: profile }, { data: doc }] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name, phone, employer, is_business_account")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("public_employee_documents")
            .select("status, reviewer_notes")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        // ── NEW: Business account conflict — show wall immediately ──
        if (profile?.is_business_account === true) {
          setStep("conflict");
          return;
        }

        // Pre-fill from profile
        if (profile?.employer) setEmployer(profile.employer);
        if (profile?.full_name) setFullName(profile.full_name);
        if (profile?.phone) setPhone(profile.phone);

        const docStatus = doc?.status ?? null;

        if (docStatus === "approved" || docStatus === "pending") {
          router.replace("/public-employee");
          return;
        }

        if (docStatus === "rejected" || forceStep === "upload") {
          setStep("upload");
          return;
        }

        if (!docStatus) {
          setStep("upload");
          return;
        }

        setStep("upload");
      } catch (e) {
        console.error("[PE signup] session check failed:", e);
        setStep("signup");
      }
    }

    checkSession();
  }, [router, forceStep]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("File size must be less than 5MB");
        return;
      }
      // Revoke previous URL before creating new one
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  }

  // ── Ethiopian phone number validation ──
  function validatePhone(phone: string): boolean {
    // Accepts formats: +251 91 234 5678, 0912345678, +251912345678
    const cleaned = phone.replace(/\s/g, "");
    const ethiopianRegex = /^(\+251|0)?[79]\d{8}$/;
    return ethiopianRegex.test(cleaned);
  }

  // ── Email validation ──
  function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!validateEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!validatePhone(phone)) {
      setError("Please enter a valid Ethiopian phone number (e.g., +251 91 234 5678 or 0912345678)");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (employer.length < 2 || employer.length > 100) {
      setError("Employer name must be between 2 and 100 characters");
      return;
    }

    setIsLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          setError(
            "An account with this email already exists. Please sign in instead."
          );
        } else {
          throw authError;
        }
        setIsLoading(false);
        return;
      }

      if (!authData.user) throw new Error("Failed to create account");

      setUserId(authData.user.id);

      // ── Use update instead of upsert for security ──
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          employer,
          is_public_employee: true,
          gov_employee_status: "pending",
          pe_submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", authData.user.id);

      // If update fails (no row), insert new
      if (profileError?.code === "PGRST116") {
        const { error: insertError } = await supabase.from("profiles").insert({
          id: authData.user.id,
          full_name: fullName,
          phone,
          employer,
          is_public_employee: true,
          gov_employee_status: "pending",
          pe_submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (insertError) throw insertError;
      } else if (profileError) {
        throw profileError;
      }

      setStep("upload");
    } catch (err: any) {
      console.error("Signup error:", err);
      setError(err.message || "Failed to create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select a document");
      return;
    }

    if (!employer || employer.length < 2) {
      setError("Please enter your employer name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError || !refreshData.session?.user) {
        setError("Your session expired. Please log in again.");
        setIsLoading(false);
        return;
      }

      const session = refreshData.session;
      const uid = session.user.id;
      setUserId(uid);

      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${uid}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("public_employee_docs")
        .upload(fileName, selectedFile, { cacheControl: "3600", upsert: false });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const {
        data: { publicUrl },
      } = supabase.storage.from("public_employee_docs").getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          pe_document_url: publicUrl,
          employer: employer || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", uid);

      if (updateError)
        throw new Error(`Profile update failed: ${updateError.message}`);

      const { error: docError } = await supabase
        .from("public_employee_documents")
        .insert({
          user_id: uid,
          employer_name: employer || null,
          document_url: publicUrl,
          storage_path: fileName,
          document_type: selectedFile.type,
          status: "pending",
          product_id: productId || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (docError)
        throw new Error(`Document insert failed: ${docError.message}`);

      await supabase
        .from("profiles")
        .update({
          gov_employee_status: "pending",
          is_public_employee: true,
          pe_submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", uid);

      setStep("success");
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleContinue = useCallback(() => {
    const url = new URL(window.location.origin + redirect);
    url.searchParams.set("applied", "1");
    if (productId) url.searchParams.set("product_id", productId);
    // ── CRITICAL FIX: Removed space before toString() ──
    router.push(url.pathname + "?" + url.searchParams.toString());
  }, [redirect, productId, router]);

  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  const ProgressBar = () => (
    <div className="flex items-center justify-center gap-2 mb-6" role="progressbar" aria-label="Signup progress">
      {[
        {
          num: 1,
          label: "Sign Up",
          active: step === "signup",
          done: step === "upload" || step === "success",
        },
        {
          num: 2,
          label: "Upload ID",
          active: step === "upload",
          done: step === "success",
        },
        { num: 3, label: "Done", active: step === "success", done: false },
      ].map((s, i) => (
        <div key={i} className="flex items-center">
          <div
            className={`flex flex-col items-center ${s.active ? "scale-110" : ""} transition-transform`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                s.done
                  ? "bg-emerald-500 text-white"
                  : s.active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
              aria-current={s.active ? "step" : undefined}
            >
              {s.done ? "✓" : s.num}
            </div>
            <span
              className={`text-[9px] font-bold mt-1 ${
                s.active || s.done ? "text-slate-900" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < 2 && (
            <div
              className={`w-8 h-0.5 mx-1 ${s.done ? "bg-emerald-500" : "bg-slate-200"}`}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  );

  // ── Checking state ──
  if (step === "checking") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" aria-label="Loading" />
          <span className="text-sm text-slate-500 font-medium">
            Checking your account...
          </span>
        </div>
      </main>
    );
  }

  // ── NEW: Business conflict wall ──
  if (step === "conflict") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="mx-auto max-w-sm w-full">
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                <line x1="12" y1="12" x2="12" y2="16" />
                <line x1="10" y1="14" x2="14" y2="14" />
              </svg>
            </div>

            <h2 className="text-xl font-black text-slate-900 mb-2 tracking-tight">
              Business Account Active
            </h2>

            <p className="text-sm text-slate-500 leading-relaxed mb-2">
              Your account is enrolled in{" "}
              <span className="font-bold text-slate-700">HahuShop Business</span>.
            </p>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Business and Public Employee accounts are mutually exclusive. To
              access Public Employee pricing you would need to leave the Business
              program first. Contact support if you need help switching.
            </p>

            <button
              onClick={() => router.push("/business")}
              className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm mb-3 active:scale-[0.98] transition-all"
            >
              Go to Business Dashboard
            </button>

            <button
              onClick={() => router.push("/shop")}
              className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              Continue Shopping
            </button>

            <p className="mt-5 text-[10px] text-slate-400">
              Need help?{" "}
              <button
                type="button"
                className="text-blue-600 font-bold hover:underline"
                onClick={() => router.push("/help")}
              >
                Contact support
              </button>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-6 md:py-10 bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="mx-auto max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white text-3xl shadow-xl shadow-orange-500/30 mb-3" aria-hidden="true">
            🎖️
          </div>
          <h1 className="text-2xl font-black text-slate-900">Public Employee</h1>
          <p className="text-sm text-slate-600">Exclusive pricing for government staff</p>
        </div>

        <ProgressBar />

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm" role="alert" aria-live="polite">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{error}</span>
              {error.includes("sign in") && (
                <Link
                  href={`/auth/login?redirect=${encodeURIComponent(
                    "/public-employee/signup"
                  )}`}
                  className="ml-auto text-blue-600 font-bold underline whitespace-nowrap text-xs"
                >
                  Sign in →
                </Link>
              )}
            </div>
            {/* ── NEW: Retry button for recoverable errors ── */}
            {!error.includes("already registered") && !error.includes("sign in") && (
              <button
                onClick={handleRetry}
                className="mt-2 text-xs font-bold text-red-600 hover:underline"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* ── Step 1: Sign Up ── */}
        {step === "signup" && (
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="text-center mb-5">
              <h2 className="text-lg font-bold text-slate-900">
                Create your account
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Verify once, save forever on every order
              </p>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="email" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+251 91 234 5678"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    maxLength={20}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="fullName" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  maxLength={100}
                />
              </div>

              <div>
                <label htmlFor="employer" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Employer <span className="text-red-500">*</span>
                </label>
                <input
                  id="employer"
                  type="text"
                  required
                  value={employer}
                  onChange={(e) => setEmployer(e.target.value)}
                  placeholder="Ministry of Education, General Hospital, etc."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  maxLength={100}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    Confirm <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <svg
                  className="w-5 h-5 text-amber-500 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-[10px] text-amber-800 font-medium">
                  Verification takes{" "}
                  <span className="font-bold">~3 hours</span> during business
                  hours
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-sm shadow-lg shadow-blue-600/30 disabled:opacity-70 active:scale-[0.98] transition-all duration-200"
              >
                {isLoading ? "Creating account..." : "Continue →"}
              </button>

              <p className="text-center text-[10px] text-slate-400">
                Already have an account?{" "}
                <Link
                  href="/auth/login"
                  className="text-blue-600 font-bold hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        )}

        {/* ── Step 2: Upload ── */}
        {step === "upload" && (
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
            {userId && (
              <div className="mb-5 flex items-center gap-3 p-3 rounded-2xl bg-blue-50 border border-blue-100">
                <span className="text-xl" aria-hidden="true">👋</span>
                <div>
                  <p className="text-xs font-bold text-blue-900">
                    You&apos;re signed in
                  </p>
                  <p className="text-[10px] text-blue-700 mt-0.5">
                    Just upload your employment document to complete
                    verification.
                  </p>
                </div>
              </div>
            )}

            <div className="text-center mb-5">
              <h2 className="text-lg font-bold text-slate-900">
                Verify your employment
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Upload your ID card, payslip, or employment letter
              </p>
            </div>

            {userId && (
              <div className="mb-4">
                <label htmlFor="employerUpload" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  Employer <span className="text-red-500">*</span>
                </label>
                <input
                  id="employerUpload"
                  type="text"
                  required
                  value={employer}
                  onChange={(e) => setEmployer(e.target.value)}
                  placeholder="Ministry of Education, General Hospital, etc."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  maxLength={100}
                />
              </div>
            )}

            <form onSubmit={handleUpload} className="space-y-4">
              {/* ── Accessibility fix: Use button instead of div with onClick ── */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`relative w-full border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
                  previewUrl
                    ? "border-emerald-400 bg-emerald-50/50"
                    : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"
                }`}
                aria-label="Upload employment document"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-label="Select file"
                />

                {previewUrl ? (
                  <div className="space-y-2">
                    {selectedFile?.type === "application/pdf" ? (
                      <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-red-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    ) : (
                      <img
                        src={previewUrl}
                        alt="Document preview"
                        className="max-h-32 mx-auto rounded-lg shadow-md"
                      />
                    )}
                    <p className="text-xs font-bold text-emerald-700">
                      {selectedFile?.name}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="text-[10px] text-rose-600 font-bold hover:underline"
                    >
                      Remove &amp; upload different
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-14 h-14 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
                      <svg
                        className="w-7 h-7 text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                      Tap to upload document
                    </p>
                    <p className="text-[10px] text-slate-400">
                      JPG, PNG, or PDF up to 5MB
                    </p>
                  </div>
                )}
              </button>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: "🪪", label: "ID Card" },
                  { icon: "📄", label: "Payslip" },
                  { icon: "📋", label: "Letter" },
                ].map((doc) => (
                  <div
                    key={doc.label}
                    className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <div className="text-xl mb-0.5" aria-hidden="true">{doc.icon}</div>
                    <div className="text-[9px] font-bold text-slate-600">
                      {doc.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
                <svg
                  className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-[10px] text-blue-800 font-medium leading-relaxed">
                  Your document is encrypted and only used for verification. We
                  never share it with third parties.
                </p>
              </div>

              <div className="flex gap-3">
                {/* ── UX Fix: Always show back button, not just when !userId ── */}
                <button
                  type="button"
                  onClick={() => setStep("signup")}
                  disabled={isLoading}
                  className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-bold text-sm hover:border-slate-300 transition-colors disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || isLoading}
                  className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-200"
                >
                  {isLoading ? "Uploading..." : "Submit for verification"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Step 3: Success ── */}
        {step === "success" && (
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
            {/* ── Accessibility fix: Replace animate-bounce with subtle pulse ── */}
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-4xl shadow-xl shadow-emerald-500/30 mb-4 animate-pulse" aria-hidden="true">
              ✓
            </div>

            <h2 className="text-2xl font-black text-slate-900 mb-2">
              Application sent!
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              We&apos;re verifying your documents. You&apos;ll be notified once
              approved.
            </p>

            <div className="bg-slate-50 rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">Status</span>
                <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  Pending
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Estimated time</span>
                <span className="text-xs font-bold text-slate-700">
                  ~3 hours
                </span>
              </div>
            </div>

            <button
              onClick={handleContinue}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-sm shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all duration-200"
            >
              Continue shopping →
            </button>

            <p className="mt-4 text-[10px] text-slate-400">
              Questions?{" "}
              <button
                type="button"
                className="text-blue-600 font-bold hover:underline"
                onClick={() => router.push("/help")}
              >
                Contact support
              </button>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PublicEmployeeSignupPage() {
  return (
    <Suspense fallback={null}>
      <PublicEmployeeSignupPageContent />
    </Suspense>
  );
}