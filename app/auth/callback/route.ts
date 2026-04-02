import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  syncProfileFromAuthUser,
  getRoleHintFromUser,
  normalizeAppRole,
} from "@/lib/authProfile";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Bootstrap profile from user_metadata (critical for email-confirm signups
      // where the signup page couldn't update the profile due to missing session).
      let redirectPath = next;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const roleHint = getRoleHintFromUser(user);

          if (roleHint) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("role, seller_status")
              .eq("id", user.id)
              .maybeSingle();

            const existingRole = normalizeAppRole(profile?.role);

            // Bootstrap profile if it doesn't exist yet.
            // NOTE: syncProfileFromAuthUser no longer auto-sets role='seller'.
            // Seller role is granted only by admin approval.
            if (!existingRole) {
              await syncProfileFromAuthUser(supabase, user, roleHint);
            }

            // Route seller applicants to verification page
            // (they need admin approval before accessing /seller dashboard)
            if (roleHint === "seller" && existingRole !== "seller") {
              redirectPath = "/seller/verification";
            }
          }
        }
      } catch (syncErr) {
        console.error("[auth/callback] profile sync failed:", syncErr);
      }

      return NextResponse.redirect(new URL(redirectPath, origin));
    }
  }

  // If code exchange failed, redirect to login with an error hint
  return NextResponse.redirect(new URL("/auth/login?error=auth", origin));
}
