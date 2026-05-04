// app/api/admin/payment-controls/route.ts
// Admin-only API to read and toggle payment method availability.
// Uses the service-role client so updates bypass any RLS edge cases.

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

  return { userId: session.user.id, db };
}

// GET /api/admin/payment-controls
// Returns all payment method rows ordered by sort_order.
export async function GET() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin.db
    .from("payment_method_controls")
    .select("id, label, is_enabled, sort_order, updated_at")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ methods: data ?? [] });
}

// PATCH /api/admin/payment-controls
// Body: { id: string; is_enabled: boolean }
// Toggles a single payment method and returns the updated row.
export async function PATCH(req: NextRequest) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { id?: string; is_enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, is_enabled } = body;

  if (typeof id !== "string" || id.trim() === "") {
    return NextResponse.json({ error: "Missing field: id" }, { status: 400 });
  }
  if (typeof is_enabled !== "boolean") {
    return NextResponse.json(
      { error: "Missing or invalid field: is_enabled (must be boolean)" },
      { status: 400 }
    );
  }

  const { data, error } = await admin.db
    .from("payment_method_controls")
    .update({
      is_enabled,
      updated_at: new Date().toISOString(),
      updated_by: admin.userId,
    })
    .eq("id", id)
    .select("id, label, is_enabled, sort_order, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: `Payment method '${id}' not found` },
      { status: 404 }
    );
  }

  return NextResponse.json({ method: data });
}
