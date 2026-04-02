// API route for admin seller actions (approve, reject, revert)
// Uses service role key to bypass RLS on profiles table
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function getAuthenticatedAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can throw in read-only contexts
          }
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;

  return session.user.id;
}

/* ─── GET: Fetch all seller data (bypasses RLS) ──────────────── */

export async function GET() {
  try {
    const adminId = await getAuthenticatedAdmin();
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getSupabaseAdmin();

    // Fetch all data sources in parallel using service role (bypasses RLS)
    const [appsRes, docsRes, productsRes, profilesRes] = await Promise.all([
      db
        .from("seller_applications")
        .select("id, user_id, business_name, status, applied_at")
        .order("applied_at", { ascending: false }),
      db
        .from("seller_documents")
        .select("id, seller_id, document_type, file_url, status, admin_notes, created_at")
        .order("created_at", { ascending: false }),
      db.from("products").select("seller_id"),
      db
        .from("profiles")
        .select("id, display_name, full_name, phone, business_name, role, seller_status")
        .or("role.eq.seller,seller_status.eq.approved,seller_status.eq.rejected"),
    ]);

    const apps = appsRes.data ?? [];
    const docs = docsRes.data ?? [];
    const products = productsRes.data ?? [];
    const profilesWithStatus = profilesRes.data ?? [];

    // Collect seller IDs from applications, documents, products, and profiles
    const sellerIdSet = new Set<string>();
    apps.forEach((a: { user_id: string }) => sellerIdSet.add(a.user_id));
    docs.forEach((d: { seller_id: string }) => sellerIdSet.add(d.seller_id));
    products.forEach((p: { seller_id: string | null }) => {
      if (p.seller_id) sellerIdSet.add(p.seller_id);
    });
    profilesWithStatus.forEach((p: { id: string }) => sellerIdSet.add(p.id));

    // Remove admin's own ID
    sellerIdSet.delete(adminId);

    // Remove ALL admin accounts from the seller list
    const { data: adminProfiles } = await db
      .from("profiles")
      .select("id")
      .eq("role", "admin");
    if (adminProfiles) {
      adminProfiles.forEach((a: { id: string }) => sellerIdSet.delete(a.id));
    }

    if (sellerIdSet.size === 0) {
      return NextResponse.json({ sellers: [] });
    }

    const sellerIds = [...sellerIdSet];

    // Fetch full profiles for all discovered sellers (service role — bypasses RLS)
    const { data: allProfiles } = await db
      .from("profiles")
      .select("id, display_name, full_name, phone, business_name, role, seller_status")
      .in("id", sellerIds);

    return NextResponse.json({
      profiles: allProfiles ?? [],
      applications: apps,
      documents: docs,
      products,
    });
  } catch (error: unknown) {
    console.error("[admin/sellers GET] error:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to load sellers") },
      { status: 500 }
    );
  }
}

/* ─── POST: Approve / Reject / Revert seller ────────────────── */

export async function POST(req: NextRequest) {
  try {
    const adminId = await getAuthenticatedAdmin();
    if (!adminId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { action: string; sellerId: string; applicationId?: string; documentIds?: string[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { action, sellerId, applicationId, documentIds } = body;

    if (!sellerId || typeof sellerId !== "string") {
      return NextResponse.json({ error: "Missing sellerId" }, { status: 400 });
    }

    if (!["approve", "reject", "revert"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // Safety: never modify an admin account
    const { data: targetProfile } = await db
      .from("profiles")
      .select("role")
      .eq("id", sellerId)
      .maybeSingle();

    if (targetProfile?.role === "admin") {
      return NextResponse.json(
        { error: "Cannot modify an admin account" },
        { status: 403 }
      );
    }

    if (action === "approve") {
      const { error: profileErr } = await db
        .from("profiles")
        .update({
          role: "seller",
          seller_status: "approved",
          is_verified_seller: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sellerId);

      if (profileErr) throw profileErr;

      if (applicationId) {
        await db
          .from("seller_applications")
          .update({ status: "approved" })
          .eq("id", applicationId);
      }

      await db
        .from("seller_applications")
        .update({ status: "approved" })
        .eq("user_id", sellerId)
        .neq("status", "approved");

      if (documentIds && documentIds.length > 0) {
        await db
          .from("seller_documents")
          .update({
            status: "approved",
            reviewed_at: new Date().toISOString(),
          })
          .in("id", documentIds);
      }

      await db
        .from("seller_documents")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("seller_id", sellerId)
        .eq("status", "pending");

      return NextResponse.json({ success: true, action: "approved" });
    }

    if (action === "reject") {
      const { error: profileErr } = await db
        .from("profiles")
        .update({
          role: "customer",
          seller_status: "rejected",
          is_verified_seller: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sellerId);

      if (profileErr) throw profileErr;

      if (applicationId) {
        await db
          .from("seller_applications")
          .update({ status: "rejected" })
          .eq("id", applicationId);
      }

      await db
        .from("seller_applications")
        .update({ status: "rejected" })
        .eq("user_id", sellerId)
        .neq("status", "rejected");

      return NextResponse.json({ success: true, action: "rejected" });
    }

    if (action === "revert") {
      const { error: profileErr } = await db
        .from("profiles")
        .update({
          role: "customer",
          seller_status: "pending",
          is_verified_seller: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sellerId);

      if (profileErr) throw profileErr;

      if (applicationId) {
        await db
          .from("seller_applications")
          .update({ status: "pending" })
          .eq("id", applicationId);
      }

      await db
        .from("seller_applications")
        .update({ status: "pending" })
        .eq("user_id", sellerId)
        .neq("status", "pending");

      return NextResponse.json({ success: true, action: "reverted" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    console.error("[admin/sellers API] error:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to process action") },
      { status: 500 }
    );
  }
}
