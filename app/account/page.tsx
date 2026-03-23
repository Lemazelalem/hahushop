// app/account/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  role: string | null;
  full_name: string | null;
  phone: string | null;
  default_shipping_address_id: string | null;
};

type AddressRow = {
  id: string;
  user_id: string;
  label: string | null;
  full_name: string | null;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

type FormState = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [address, setAddress] = useState<AddressRow | null>(null);

  const [form, setForm] = useState<FormState>({
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });

  // Load current user, profile, and primary shipping address
  useEffect(() => {
    async function load() {
      setLoading(true);
      setPageError(null);

      const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/auth/login?redirect=/account");
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userError || !user) {
        router.replace("/auth/login?redirect=/account");
        return;
      }

      // 1) Profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, role, full_name, phone, default_shipping_address_id"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error(profileError);
        setPageError(profileError.message || "Could not load profile.");
        setLoading(false);
        return;
      }

      const profileRow = profileData as ProfileRow | null;
      setProfile(profileRow);

      // 2) Addresses for this user
      const { data: addressData, error: addressError } = await supabase
        .from("customer_addresses")
        .select(
          "id, user_id, label, full_name, phone, line1, line2, city, state, postal_code, country"
        )
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (addressError) {
        console.error(addressError);
        setPageError(addressError.message || "Could not load addresses.");
        setLoading(false);
        return;
      }

      const addresses = (addressData ?? []) as AddressRow[];

      // Determine primary address: default_shipping_address_id or first one
      let primary: AddressRow | null = null;

      if (profileRow?.default_shipping_address_id) {
        primary =
          addresses.find(
            (a) => a.id === profileRow.default_shipping_address_id
          ) || null;
      }

      if (!primary && addresses.length > 0) {
        primary = addresses[0]!;
      }

      setAddress(primary);

      // Seed form values from profile + primary address
      setForm({
        fullName: profileRow?.full_name || "",
        phone: profileRow?.phone || "",
        line1: primary?.line1 || "",
        line2: primary?.line2 || "",
        city: primary?.city || "",
        state: primary?.state || "",
        postalCode: primary?.postal_code || "",
        country: primary?.country || "US",
      });

      setLoading(false);
    }

    load();
  }, []);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!profile) return;

    // Minimal validation for shipping address
    if (!form.line1.trim() || !form.city.trim() || !form.postalCode.trim()) {
      alert("Please fill in street address, city, and postal code.");
      return;
    }

    setSaving(true);
    setPageError(null);

    try {
      // 1) Update profile (name + phone)
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          full_name: form.fullName.trim() || null,
          phone: form.phone.trim() || null,
        })
        .eq("id", profile.id);

      if (profileUpdateError) {
        console.error(profileUpdateError);
        setPageError(
          profileUpdateError.message || "Could not update profile."
        );
        return;
      }

      const userId = profile.id;

      // 2) Insert or update primary address
      let addressId = address?.id ?? null;

      if (addressId) {
        const { error: addrUpdateError, data: addrUpdateData } = await supabase
          .from("customer_addresses")
          .update({
            label: "Primary",
            full_name: form.fullName.trim() || null,
            phone: form.phone.trim() || null,
            line1: form.line1.trim(),
            line2: form.line2.trim() || null,
            city: form.city.trim(),
            state: form.state.trim() || null,
            postal_code: form.postalCode.trim() || null,
            country: form.country.trim() || "US",
          })
          .eq("id", addressId)
          .select(
            "id, user_id, label, full_name, phone, line1, line2, city, state, postal_code, country"
          )
          .maybeSingle();

        if (addrUpdateError) {
          console.error(addrUpdateError);
          setPageError(
            addrUpdateError.message || "Could not update shipping address."
          );
          return;
        }

        if (addrUpdateData) {
          setAddress(addrUpdateData as AddressRow);
        }
      } else {
        const { data: addrInsertData, error: addrInsertError } = await supabase
          .from("customer_addresses")
          .insert({
            user_id: userId,
            label: "Primary",
            full_name: form.fullName.trim() || null,
            phone: form.phone.trim() || null,
            line1: form.line1.trim(),
            line2: form.line2.trim() || null,
            city: form.city.trim(),
            state: form.state.trim() || null,
            postal_code: form.postalCode.trim() || null,
            country: form.country.trim() || "US",
          })
          .select(
            "id, user_id, label, full_name, phone, line1, line2, city, state, postal_code, country"
          )
          .maybeSingle();

        if (addrInsertError) {
          console.error(addrInsertError);
          setPageError(
            addrInsertError.message || "Could not save shipping address."
          );
          return;
        }

        if (addrInsertData) {
          const inserted = addrInsertData as AddressRow;
          addressId = inserted.id;
          setAddress(inserted);
        }
      }

      // 3) Ensure profile.default_shipping_address_id is set
      if (addressId && profile.default_shipping_address_id !== addressId) {
        const { error: defaultUpdateError } = await supabase
          .from("profiles")
          .update({ default_shipping_address_id: addressId })
          .eq("id", profile.id);

        if (defaultUpdateError) {
          console.error(defaultUpdateError);
          // Not fatal for user experience; we still keep address
        }
      }

      alert("Profile and shipping address saved.");
    } catch (err: any) {
      console.error(err);
      setPageError("Unexpected error while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10">
      {/* Background layers */}
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto max-w-4xl">
        <div className="glass glass-card glow-blue rounded-[28px] glass-ring p-6 md:p-8 mt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-700">
                My account
              </div>
              <div className="text-3xl font-semibold text-slate-900">
                Profile & shipping
              </div>
              <div className="text-sm text-slate-700 mt-1">
                This information will be used for orders and deliveries later.
              </div>
            </div>

            <button
              className="pill px-4 py-2 font-semibold text-slate-900"
              onClick={() => router.push("/shop")}
            >
              ← Back to shop
            </button>
          </div>

          {pageError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          )}

          {loading ? (
            <div className="mt-6 text-sm text-slate-700">
              Loading your profile…
            </div>
          ) : !profile ? (
            <div className="mt-6 text-sm text-slate-700">
              Could not load your profile.
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {/* Profile card */}
              <div className="rounded-[22px] bg-white/75 border border-white/80 p-4 glass-ring">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Profile
                </h2>

                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full name
                    </label>
                    <input
                      type="text"
                      value={form.fullName}
                      onChange={(e) =>
                        updateForm("fullName", e.target.value)
                      }
                      className="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => updateForm("phone", e.target.value)}
                      className="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none"
                      placeholder="Contact phone"
                    />
                  </div>

                  <div className="text-xs text-slate-500 mt-2">
                    Role:{" "}
                    <span className="font-semibold">
                      {profile.role || "customer"}
                    </span>
                  </div>

                </div>
              </div>

              {/* Shipping address card */}
              <div className="rounded-[22px] bg-white/75 border border-white/80 p-4 glass-ring">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Primary shipping address
                </h2>

                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Street address
                    </label>
                    <input
                      type="text"
                      value={form.line1}
                      onChange={(e) => updateForm("line1", e.target.value)}
                      className="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none"
                      placeholder="Street and number"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Apt / Suite / Unit (optional)
                    </label>
                    <input
                      type="text"
                      value={form.line2}
                      onChange={(e) => updateForm("line2", e.target.value)}
                      className="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none"
                      placeholder="Apartment, floor, etc."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) =>
                          updateForm("city", e.target.value)
                        }
                        className="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        value={form.state}
                        onChange={(e) =>
                          updateForm("state", e.target.value)
                        }
                        className="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Postal code
                      </label>
                      <input
                        type="text"
                        value={form.postalCode}
                        onChange={(e) =>
                          updateForm("postalCode", e.target.value)
                        }
                        className="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Country
                      </label>
                      <input
                        type="text"
                        value={form.country}
                        onChange={(e) =>
                          updateForm("country", e.target.value)
                        }
                        className="w-full rounded-full border border-white/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 mt-1">
                    This address will be used as your default shipping address
                    for future orders.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!loading && profile && (
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="btn-cta rounded-full px-6 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save profile & address"}
              </button>
            </div>
          )}
        </div>

        <footer className="mx-auto mt-8 pb-8 text-center text-xs text-slate-700">
          Account • Profile and shipping details are stored securely in
          Supabase.
        </footer>
      </div>
    </main>
  );
}
