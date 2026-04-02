// app/components/Header.tsx
"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMiniCart } from "@/components/MiniCartProvider";
import { supabase } from "@/lib/supabaseClient";
import {
  MapPin,
  Search,
  ShoppingCart,
  ChevronDown,
  Menu,
  Globe,
  Package,
  Clock,
  X,
  BadgeCheck,
  LogOut,
  UserCircle,
  ShoppingBag,
  Heart,
  Settings,
  Store,
  LayoutDashboard,
  Users,
  Box,
  ClipboardList,
  CreditCard,
  Repeat,
  Briefcase,
  ArrowRight,
} from "lucide-react";

type CategoryRow = { id: string; name: string };

const HISTORY_KEY = "shopease_search_history_v1";
const DELIVERY_KEY = "shopease_delivery_city_v1";
const LANG_KEY = "shopease_lang_v1";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 10);
  } catch {
    return [];
  }
}

function writeHistory(term: string) {
  if (typeof window === "undefined") return;
  const t = term.trim();
  if (!t) return;
  const prev = readHistory();
  const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 10);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

type SuggestionItem = {
  text: string;
  source: "history" | "product";
};

type HeaderUser = {
  id: string;
  email: string | null;
  displayName: string | null;
};

interface Profile {
  id: string;
  role: "admin" | "seller" | "customer" | null;
  is_public_employee: boolean;
  pe_verification_status: "pending" | "approved" | "rejected" | null;
  business_name?: string;
  seller_status?: string;
  is_business_account?: boolean;
  business_org_name?: string | null;
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { itemCount } = useMiniCart();

  const urlQ = searchParams.get("q") ?? "";
  const urlCat = searchParams.get("cat") ?? "all";

  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string>("all");

  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [sOpen, setSOpen] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);

  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryCity, setDeliveryCity] = useState("Addis Ababa");
  const [deliveryDraft, setDeliveryDraft] = useState("Addis Ababa");

  const [langOpen, setLangOpen] = useState(false);
  const [lang, setLang] = useState<"EN" | "AM">("EN");

  const [user, setUser] = useState<HeaderUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const headerRootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  const [catActiveIndex, setCatActiveIndex] = useState(0);
  const catListRef = useRef<HTMLDivElement>(null);

  const userRole = profile?.role ?? null;
  const isCustomer = userRole === "customer";
  const isAdmin = userRole === "admin";
  const isSeller = userRole === "seller";
  const isBusinessAccount = profile?.is_business_account === true;

  useEffect(() => {
    setHistory(readHistory());
    if (typeof window !== "undefined") {
      const savedCity = window.localStorage.getItem(DELIVERY_KEY);
      if (savedCity && savedCity.trim()) {
        setDeliveryCity(savedCity.trim());
        setDeliveryDraft(savedCity.trim());
      }
      const savedLang = window.localStorage.getItem(LANG_KEY);
      if (savedLang === "EN" || savedLang === "AM") setLang(savedLang);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadAuth() {
      try {
        // Fast path: read local session first so header can render instantly.
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!alive) return;

        const cachedUser = session?.user ?? null;
        if (!cachedUser) {
          setUser(null);
          setProfile(null);
          setAuthLoaded(true);
          return;
        }

        setUser({ id: cachedUser.id, email: cachedUser.email ?? null, displayName: null });

        // Verified path: refresh user via auth service.
        const { data } = await supabase.auth.getUser();
        const u = data?.user;

        if (!alive) return;

        if (!u) {
          setUser(null);
          setProfile(null);
          setAuthLoaded(true);
          return;
        }

        let displayName: string | null = null;
        let profileData: Profile | null = null;

        try {
          const { data: prof, error: profError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", u.id)
            .single();

          if (profError) console.error("Profile fetch error:", profError);

          if (prof) {
            let normalizedRole: Profile["role"] = null;
            const rawRole = (prof as any).role;
            if (typeof rawRole === "string") {
              const r = rawRole.trim().toLowerCase();
              if (r === "admin" || r === "seller" || r === "customer") {
                normalizedRole = r;
              }
            }

            profileData = {
              id: prof.id,
              role: normalizedRole,
              is_public_employee: prof.is_public_employee,
              pe_verification_status: prof.pe_verification_status,
              business_name: prof.business_name,
              seller_status: prof.seller_status,
              is_business_account: prof.is_business_account ?? false,
              business_org_name: prof.business_org_name ?? null,
            };

            const candidate =
              prof.display_name || prof.full_name || prof.name || prof.business_name;
            if (candidate && String(candidate).trim()) {
              displayName = String(candidate).trim();
            }
          }
        } catch (err) {
          console.error("Profile load error:", err);
        }

        if (!alive) return;

        setUser({ id: u.id, email: u.email ?? null, displayName });
        setProfile(profileData);
        setAuthLoaded(true);
      } catch (err) {
        console.error("Auth load error:", err);
        if (!alive) return;
        setUser(null);
        setProfile(null);
        setAuthLoaded(true);
      }
    }

    loadAuth();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session?.user) {
        loadAuth();
      } else {
        setUser(null);
        setProfile(null);
        setAuthLoaded(true);
      }
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (pathname === "/shop") {
      setQ(urlQ);
      setSelectedCat(urlCat || "all");
    }
  }, [pathname, urlQ, urlCat]);

  useEffect(() => {
    let alive = true;
    async function loadCats() {
      try {
        const { data, error } = await supabase
          .from("categories")
          .select("id,name")
          .order("name", { ascending: true });
        if (!alive) return;
        if (error) throw error;
        setCategories((data ?? []) as CategoryRow[]);
      } catch {
        if (!alive) return;
        setCategories([]);
      }
    }
    loadCats();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const root = headerRootRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setCatOpen(false);
        setSOpen(false);
        setDeliveryOpen(false);
        setLangOpen(false);
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Logout error:", error);
        alert("Could not log out. Please try again.");
        return;
      }
      setUser(null);
      setProfile(null);
      setAccountOpen(false);
      router.push("/");
    } catch (err) {
      console.error("Unexpected logout error:", err);
      alert("An error occurred while logging out.");
    } finally {
      setLoggingOut(false);
    }
  }

  function goSearch(nextTerm?: string, nextCat?: string) {
    const term = (nextTerm ?? q).trim();
    const cat = (nextCat ?? selectedCat).trim() || "all";
    if (term) writeHistory(term);
    setHistory(readHistory());
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (cat !== "all") params.set("cat", cat);
    if (params.toString() === "") router.push("/shop");
    else router.push(`/shop?${params.toString()}`);
    setCatOpen(false);
    setSOpen(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    goSearch();
  }

  const selectedCatLabel = useMemo(() => {
    if (selectedCat === "all") return "All";
    const found = categories.find((c) => c.id === selectedCat);
    return found?.name ?? "All";
  }, [selectedCat, categories]);

  const amazonCats = useMemo(() => {
    const list: Array<{ id: string; name: string }> = [{ id: "all", name: "All Departments" }];
    for (const c of categories) list.push({ id: c.id, name: c.name });
    return list;
  }, [categories]);

  useEffect(() => {
    const idx = amazonCats.findIndex((c) => c.id === selectedCat);
    setCatActiveIndex(idx >= 0 ? idx : 0);
  }, [selectedCat, amazonCats]);

  function pickCategory(catId: string) {
    setSelectedCat(catId);
    setCatOpen(false);
    goSearch(q, catId);
  }

  function ensureCatVisible(idx: number) {
    const listEl = catListRef.current;
    if (!listEl) return;
    const item = listEl.querySelector<HTMLButtonElement>(`button[data-idx="${idx}"]`);
    if (!item) return;
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    const viewTop = listEl.scrollTop;
    const viewBottom = viewTop + listEl.clientHeight;
    if (top < viewTop) listEl.scrollTop = top;
    else if (bottom > viewBottom) listEl.scrollTop = bottom - listEl.clientHeight;
  }

  function onCatKeyDown(e: React.KeyboardEvent) {
    if (!catOpen) return;
    if (!amazonCats.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCatActiveIndex((prev) => {
        const next = Math.min(prev + 1, amazonCats.length - 1);
        queueMicrotask(() => ensureCatVisible(next));
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCatActiveIndex((prev) => {
        const next = Math.max(prev - 1, 0);
        queueMicrotask(() => ensureCatVisible(next));
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = amazonCats[catActiveIndex];
      if (item) pickCategory(item.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCatOpen(false);
    }
  }

  useEffect(() => {
    let alive = true;
    const term = q.trim();
    if (!term) {
      setSuggestions([]);
      setLoadingSug(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoadingSug(true);
      try {
        const { data, error } = await supabase
          .from("products")
          .select("name")
          .eq("status", "approved")
          .ilike("name", `%${term}%`)
          .limit(7);
        if (!alive) return;
        if (error) throw error;
        const productItems: SuggestionItem[] = (data ?? [])
          .map((r: any) => String(r?.name ?? "").trim())
          .filter(Boolean)
          .map((name: string) => ({ text: name, source: "product" as const }));
        const h = readHistory()
          .filter((x) => x.toLowerCase().includes(term.toLowerCase()))
          .map((text) => ({ text, source: "history" as const }));
        const seen = new Set<string>();
        const merged: SuggestionItem[] = [];
        for (const item of [...h, ...productItems]) {
          const key = item.text.toLowerCase();
          if (!seen.has(key)) { seen.add(key); merged.push(item); }
          if (merged.length >= 8) break;
        }
        if (alive) setSuggestions(merged);
      } catch {
        if (!alive) return;
        const h = readHistory()
          .filter((x) => x.toLowerCase().includes(term.toLowerCase()))
          .slice(0, 8)
          .map((text) => ({ text, source: "history" as const }));
        setSuggestions(h);
      } finally {
        if (alive) setLoadingSug(false);
      }
    }, 180);
    return () => {
      alive = false;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, selectedCat]);

  const historyToShow = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return history;
    return history.filter((x) => x.toLowerCase().includes(term)).slice(0, 8);
  }, [history, q]);

  const suggestionPanelItems = useMemo((): SuggestionItem[] => {
    const term = q.trim();
    if (!term) return historyToShow.map((text) => ({ text, source: "history" as const }));
    return suggestions;
  }, [q, suggestions, historyToShow]);

  function saveDelivery(next: string) {
    const v = next.trim() || "Addis Ababa";
    setDeliveryCity(v);
    setDeliveryDraft(v);
    if (typeof window !== "undefined") window.localStorage.setItem(DELIVERY_KEY, v);
    setDeliveryOpen(false);
  }

  function saveLang(next: "EN" | "AM") {
    setLang(next);
    if (typeof window !== "undefined") window.localStorage.setItem(LANG_KEY, next);
    setLangOpen(false);
  }

  function goToLogin() { router.push("/auth/login"); }
  function goToSignup() { router.push("/auth/signup"); }
  function goToAccount() {
    if (user) router.push("/my-orders");
    else goToLogin();
  }

  const helloLine = useMemo(() => {
    if (!user) return "Hello, Sign in";
    const name = user.displayName?.split(" ")?.[0] || user.email?.split("@")?.[0] || "Account";
    return `Hello, ${name}`;
  }, [user]);

  const isVerifiedPE = profile?.is_public_employee && profile?.pe_verification_status === "approved";
  const isPendingPE = profile?.is_public_employee && profile?.pe_verification_status === "pending";

  return (
    <header className="sticky top-0 z-50 w-full" ref={headerRootRef} onKeyDown={onCatKeyDown}>
      {/* Top Bar */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0 hover:opacity-90 transition-opacity">
              <div className="relative">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-lime-400 via-green-400 to-cyan-400 flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center text-xs font-bold text-slate-900 shadow-md">
                  H
                </div>
              </div>
              <div className="hidden sm:block">
                <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-lime-400 to-cyan-400 bg-clip-text text-transparent">
                  HahuShop
                </span>
                <span className="block text-[10px] text-lime-400 -mt-1 tracking-wider">ETHIOPIA . ኢትዮጵያ </span>
              </div>
            </Link>

            {/* Deliver to - customers only */}
            {isCustomer && (
              <div className="hidden md:block relative">
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryOpen((v) => !v);
                    setLangOpen(false); setCatOpen(false); setSOpen(false); setAccountOpen(false);
                  }}
                  className="flex items-center gap-1 text-left hover:outline hover:outline-1 hover:outline-white/30 rounded-sm p-2 transition-all"
                >
                  <MapPin className="w-4 h-4 text-slate-400 mt-1" />
                  <div className="leading-tight">
                    <div className="text-xs text-slate-400">Deliver to</div>
                    <div className="text-sm font-bold">{deliveryCity}</div>
                  </div>
                </button>
                {deliveryOpen && (
                  <div className="absolute left-0 top-[calc(100%+10px)] w-[320px] rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <div className="text-sm font-bold">Choose delivery city</div>
                      <button type="button" onClick={() => setDeliveryOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close">
                        <X className="w-4 h-4 text-slate-500" />
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      <input
                        value={deliveryDraft}
                        onChange={(e) => setDeliveryDraft(e.target.value)}
                        placeholder="e.g. Addis Ababa"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        {["Addis Ababa","Adama","Bahir Dar","Hawassa","Mekelle","Dire Dawa"].map((c) => (
                          <button
                            key={c} type="button" onClick={() => saveDelivery(c)}
                            className={classNames("rounded-xl border px-3 py-2 text-xs font-bold text-left transition",
                              deliveryCity === c ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                            )}
                          >{c}</button>
                        ))}
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button type="button" onClick={() => { setDeliveryDraft(deliveryCity); setDeliveryOpen(false); }} className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50">Cancel</button>
                        <button type="button" onClick={() => saveDelivery(deliveryDraft)} className="px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-lime-400 to-cyan-400 text-slate-900 hover:brightness-105">Save</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Search Bar */}
            <div className="flex-1 max-w-xl mx-2" ref={searchWrapRef}>
              <div className="relative">
                <form onSubmit={onSubmit} className="flex rounded-lg focus-within:ring-2 focus-within:ring-cyan-400/50 transition-all h-10">
                  <div className="hidden sm:block relative">
                    <button
                      type="button"
                      onClick={() => { setCatOpen((v) => !v); setSOpen(false); setDeliveryOpen(false); setLangOpen(false); setAccountOpen(false); }}
                      className={classNames("flex items-center gap-1 bg-slate-100 text-slate-700 px-3 text-xs font-medium hover:bg-slate-200 transition-colors border-r border-slate-300 h-full rounded-l-lg", catOpen && "ring-2 ring-lime-400/70 ring-inset")}
                      aria-haspopup="listbox" aria-expanded={catOpen}
                    >
                      <span className="max-w-[100px] truncate">{selectedCatLabel}</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {catOpen && (
                      <div className="absolute left-0 top-[calc(100%+6px)] w-[290px] bg-white border border-slate-300 shadow-2xl overflow-hidden z-50 rounded-md" role="listbox">
                        <div ref={catListRef} className="max-h-[420px] overflow-auto py-1">
                          {amazonCats.map((c, idx) => {
                            const isActive = idx === catActiveIndex;
                            const isSelected = c.id === selectedCat;
                            return (
                              <button
                                key={c.id} data-idx={idx} type="button"
                                onMouseEnter={() => setCatActiveIndex(idx)}
                                onFocus={() => setCatActiveIndex(idx)}
                                onClick={() => pickCategory(c.id)}
                                className={classNames("w-full text-left px-3 py-2 text-[15px] leading-5","hover:bg-slate-200", isActive && "bg-slate-300/80", isSelected && "font-semibold")}
                              >{c.name}</button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <input
                    ref={inputRef} type="text" value={q}
                    onChange={(e) => { setQ(e.target.value); setSOpen(true); }}
                    onFocus={() => setSOpen(true)}
                    placeholder="Search products..."
                    className="flex-1 px-4 text-sm text-slate-900 bg-white placeholder:text-slate-500 focus:outline-none"
                  />
                  {q.trim() && (
                    <button type="button" onClick={() => { setQ(""); setSuggestions([]); setSOpen(true); inputRef.current?.focus(); }} className="bg-white px-2 flex items-center justify-center border-l border-slate-200 h-full" aria-label="Clear">
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  )}
                  <button type="submit" aria-label="Search" className="bg-gradient-to-r from-lime-400 to-cyan-400 hover:from-lime-500 hover:to-cyan-500 px-5 flex items-center justify-center transition-all h-full rounded-r-lg">
                    <Search className="w-5 h-5 text-slate-900" />
                  </button>
                </form>
                {sOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden z-40">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-600">
                        {q.trim() ? (loadingSug ? "Searching…" : "Suggestions") : "Recent searches"}
                      </div>
                      {!q.trim() && history.length > 0 && (
                        <button type="button" onClick={() => { window.localStorage.removeItem(HISTORY_KEY); setHistory([]); }} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">Clear</button>
                      )}
                    </div>
                    {suggestionPanelItems.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-slate-500">{q.trim() ? "No matches yet." : "No recent searches."}</div>
                    ) : (
                      <div className="max-h-72 overflow-auto">
                        {suggestionPanelItems.map((item, idx) => (
                          <button key={`${item.source}-${item.text}-${idx}`} type="button" onClick={() => { setQ(item.text); goSearch(item.text); }} className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-2">
                            {item.source === "history" ? <Clock className="w-4 h-4 text-slate-400" /> : <Search className="w-4 h-4 text-slate-400" />}
                            <span className="text-sm text-slate-900">{item.text}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Public Employee Button */}
            {(!user || isCustomer) && (
              <Link href="/public-employee" className="hidden md:flex items-center gap-2 px-3 py-2 rounded-full bg-gradient-to-r from-lime-400 via-green-400 to-cyan-400 text-slate-900 font-bold text-xs hover:shadow-lg hover:shadow-lime-400/30 hover:scale-105 transition-all relative flex-shrink-0">
                <span>Public Employee</span>
                {isVerifiedPE && <BadgeCheck className="w-3 h-3" />}
                {isPendingPE && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />}
              </Link>
            )}

            {/* Right Section */}
            <div className="flex items-center gap-1">
              {/* Language */}
              <div className="hidden lg:block relative">
                <button type="button" onClick={() => { setLangOpen((v) => !v); setDeliveryOpen(false); setCatOpen(false); setSOpen(false); setAccountOpen(false); }} className="flex items-center gap-1 hover:outline hover:outline-1 hover:outline-white/30 rounded-sm p-2 transition-all">
                  <Globe className="w-4 h-4" />
                  <span className="text-sm font-bold">{lang}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] w-44 rounded-xl bg-white text-slate-900 border border-slate-200 shadow-2xl overflow-hidden z-50">
                    <button type="button" onClick={() => saveLang("EN")} className={classNames("w-full px-3 py-2 text-sm text-left hover:bg-slate-50 flex items-center justify-between", lang === "EN" && "bg-slate-50 font-semibold")}>English<span className="text-xs text-slate-500">EN</span></button>
                    <button type="button" onClick={() => saveLang("AM")} className={classNames("w-full px-3 py-2 text-sm text-left hover:bg-slate-50 flex items-center justify-between", lang === "AM" && "bg-slate-50 font-semibold")}>Amharic<span className="text-xs text-slate-500">AM</span></button>
                  </div>
                )}
              </div>

              {/* Account */}
              <div className="relative" ref={accountRef}>
                {user ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setAccountOpen((v) => !v); setDeliveryOpen(false); setLangOpen(false); setCatOpen(false); setSOpen(false); }}
                      className="md:hidden flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 transition-all"
                      aria-label="Open account menu"
                    >
                      <UserCircle className="w-5 h-5 text-white" />
                    </button>
                    <button type="button" onClick={() => { setAccountOpen((v) => !v); setDeliveryOpen(false); setLangOpen(false); setCatOpen(false); setSOpen(false); }} className="hidden md:block text-left hover:outline hover:outline-1 hover:outline-white/30 rounded-sm p-2 transition-all">
                      <div className="text-xs text-slate-400">{helloLine}</div>
                      <div className="text-sm font-bold flex items-center gap-1">
                        {isAdmin ? "Admin" : isSeller ? "Seller" : "Account"}
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </button>
                    {accountOpen && (
                      <div className="absolute right-0 top-[calc(100%+10px)] w-[min(22rem,92vw)] md:w-64 rounded-xl bg-white text-slate-900 border border-slate-200 shadow-2xl overflow-hidden z-50">
                        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-lime-400 to-cyan-400 flex items-center justify-center text-slate-900 font-bold text-lg">
                              {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate">{user.displayName || user.email?.split("@")[0] || "User"}</div>
                              <div className="text-xs text-slate-500 truncate">{user.email}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {userRole && <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-600">{userRole}</div>}
                                {isBusinessAccount && <div className="text-[10px] uppercase tracking-wider font-black" style={{ color: "#a3e635" }}>· Hahu Business</div>}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="py-1">
                          {isAdmin && (
                            <>
                              <Link href="/admin" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-cyan-600 font-medium"><LayoutDashboard className="w-4 h-4" />Admin Dashboard</Link>
                              <Link href="/admin/orders" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"><ClipboardList className="w-4 h-4 text-slate-400" />Manage Orders</Link>
                              <Link href="/admin/products" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"><Box className="w-4 h-4 text-slate-400" />Manage Products</Link>
                              <Link href="/admin/users" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"><Users className="w-4 h-4 text-slate-400" />Manage Users</Link>
                            </>
                          )}
                          {isSeller && (
                            <>
                              <Link href="/seller" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-lime-600 font-medium"><Store className="w-4 h-4" />Seller Dashboard</Link>
                              <Link href="/seller/orders" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"><ShoppingBag className="w-4 h-4 text-slate-400" />My Orders</Link>
                              <Link href="/seller/products" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"><Package className="w-4 h-4 text-slate-400" />My Products</Link>
                            </>
                          )}
                          {isCustomer && (
                            <>
                              <Link href="/my-orders" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"><ShoppingBag className="w-4 h-4 text-slate-400" />My Orders</Link>
                              <Link href="/wishlist" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"><Heart className="w-4 h-4 text-slate-400" />Wishlist</Link>
                              <Link href="/profile/switch-account" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors text-cyan-600"><Repeat className="w-4 h-4" />Switch Account</Link>
                              <Link href="/seller/verification" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors font-medium text-emerald-600"><Store className="w-4 h-4" />Start Selling<ArrowRight className="w-3 h-3 ml-auto" /></Link>
                            </>
                          )}
                          {isBusinessAccount && (
                            <Link href="/business" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors font-medium" style={{ color: "#65a30d" }}>
                              <Briefcase className="w-4 h-4" />Hahu Business Dashboard
                            </Link>
                          )}
                          <Link href="/profile" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors"><UserCircle className="w-4 h-4 text-slate-400" />Profile Settings</Link>
                          <div className="border-t border-slate-100 my-1" />
                          <button type="button" onClick={handleLogout} disabled={loggingOut} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 text-red-600 transition-colors text-left">
                            <LogOut className="w-4 h-4" />
                            {loggingOut ? "Signing out..." : "Sign Out"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="hidden md:flex items-center gap-2">
                    <button type="button" onClick={goToLogin} className="text-left hover:outline hover:outline-1 hover:outline-white/30 rounded-sm p-2 transition-all">
                      <div className="text-xs text-slate-400">Hello, Sign in</div>
                      <div className="text-sm font-bold">Account</div>
                    </button>
                    <button type="button" onClick={goToSignup} className="hidden lg:block px-3 py-1.5 rounded-full bg-gradient-to-r from-lime-400 to-cyan-400 text-slate-900 text-xs font-bold hover:shadow-lg transition-all">Sign Up</button>
                  </div>
                )}
              </div>

              {/* Returns & Orders */}
              {isCustomer && (
                <Link href="/my-orders" className="hidden lg:block text-left hover:outline hover:outline-1 hover:outline-white/30 rounded-sm p-2 transition-all">
                  <div className="text-xs text-slate-400">Returns</div>
                  <div className="text-sm font-bold">&amp; Orders</div>
                </Link>
              )}

              {/* Cart */}
              {isCustomer && (
                <Link href="/checkout" data-cart-target="true" className="flex items-end gap-1 hover:outline hover:outline-1 hover:outline-white/30 rounded-sm p-2 transition-all relative">
                  <div className="relative">
                    <ShoppingCart className="w-8 h-8" />
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-lime-400 to-cyan-400 rounded-full flex items-center justify-center text-xs font-bold text-slate-900">
                      {itemCount > 99 ? "99+" : itemCount}
                    </span>
                  </div>
                  <span className="hidden md:block text-sm font-bold mb-1">Cart</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="bg-slate-800 text-white border-t border-slate-700">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-6 h-10 overflow-x-auto scrollbar-hide">
            <button className="flex items-center gap-1 font-medium hover:outline hover:outline-1 hover:outline-white/30 rounded-sm px-2 py-1 transition-all flex-shrink-0">
              <Menu className="w-4 h-4" />
              All
            </button>
            <nav className="flex items-center gap-5 text-sm font-medium whitespace-nowrap">
              <Link href="/shop" className="hover:text-lime-400 hover:underline underline-offset-4 decoration-2 decoration-lime-400 transition-all py-1">
                Shop
              </Link>

              {isAdmin && (
                <Link href="/admin" className="hover:text-lime-400 hover:underline underline-offset-4 decoration-2 decoration-lime-400 transition-all py-1">
                  Admin Home
                </Link>
              )}

              {isCustomer && (
                <Link href="/public-employee" className="flex items-center gap-1.5 hover:text-lime-400 hover:underline underline-offset-4 decoration-2 decoration-lime-400 transition-all py-1 lg:hidden">
                  <span>Public Employee</span>
                  {isVerifiedPE && <BadgeCheck className="w-3 h-3 text-lime-400" />}
                </Link>
              )}

              <Link href="/deals" className="hover:text-white/80 hover:underline underline-offset-4 transition-all py-1 hidden sm:block">
                Today&apos;s Deals
              </Link>

              <Link href="/new" className="hover:text-white/80 hover:underline underline-offset-4 transition-all py-1 hidden md:block">
                New Arrivals
              </Link>

              {/* Hahu Business — always visible in bottom nav */}
              <Link
                href="/business"
                className="flex items-center gap-1.5 transition-all py-1 flex-shrink-0 font-semibold"
                style={{ color: isBusinessAccount ? "#a3e635" : "rgba(255,255,255,0.75)" }}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span className="hover:underline underline-offset-4">Hahu Business</span>
                {isBusinessAccount && (
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#a3e635" }} />
                )}
              </Link>

              {isCustomer && (
                <Link href="/track" className="flex items-center gap-1 hover:text-white/80 hover:underline underline-offset-4 transition-all py-1 hidden lg:block">
                  <Package className="w-3.5 h-3.5" />
                  Track Order
                </Link>
              )}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}