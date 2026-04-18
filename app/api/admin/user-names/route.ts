// app/api/admin/user-names/route.ts
// Returns display names for a list of user IDs by reading auth.users metadata.
// Required because PE applicants may not have a profiles row with full_name populated.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function getAuthenticatedAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const db = getSupabaseAdmin();
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return true;
}

export async function GET(req: Request) {
  try {
    const isAdmin = await getAuthenticatedAdmin();
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ids = searchParams.get("ids");
    if (!ids) return NextResponse.json({ names: {} });

    const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (idList.length === 0) return NextResponse.json({ names: {} });

    const db = getSupabaseAdmin();

    // Fetch auth user records — contains user_metadata with full_name, name, etc.
    const results = await Promise.all(
      idList.map((id) => db.auth.admin.getUserById(id))
    );

    const names: Record<string, string> = {};
    results.forEach((res, i) => {
      const user = res.data?.user;
      if (!user) return;
      const meta = user.user_metadata ?? {};
      const name =
        meta.full_name ||
        meta.name ||
        meta.display_name ||
        user.email ||
        null;
      if (name) names[idList[i]] = name;
    });

    return NextResponse.json({ names });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load user names";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
