// API route for admin seller actions (approve, reject, revert)
// Uses service role key to bypass RLS on profiles table
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

      if (documentIds && documentIds.length > 0) {
        await db
          .from("seller_documents")
          .update({
            status: "approved",
            reviewed_at: new Date().toISOString(),
          })
          .in("id", documentIds);
      }

      return NextResponse.json({ success: true, action: "approved" });
    }

    if (action === "reject") {
      const { error: profileErr } = await db
        .from("profiles")
        .update({
          seller_status: "rejected",
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

      return NextResponse.json({ success: true, action: "rejected" });
    }

    if (action === "revert") {
      const { error: profileErr } = await db
        .from("profiles")
        .update({
          seller_status: "pending",
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

      return NextResponse.json({ success: true, action: "reverted" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[admin/sellers API] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to process action" },
      { status: 500 }
    );
  }
}
