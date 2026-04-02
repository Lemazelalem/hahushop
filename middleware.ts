// middleware.ts — server-side auth + role gate for protected routes
// Runs at the Edge before any page renders, preventing unauthenticated flashes
// and blocking wrong-role access to /admin/* and /seller/* at the server level.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Forward cookie writes onto both the request and the response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate the session (JWT-verified against Supabase auth server)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── 1. Unauthenticated — redirect to login for all protected routes ──────────
  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 2. Role check for /admin/* ────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      // Authenticated but not an admin — send to home
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // ── 3. Role check for /seller/* ───────────────────────────────────────────────
  if (pathname.startsWith("/seller")) {
    const isSellerOnboardingRoute =
      pathname === "/seller/verification" ||
      pathname.startsWith("/seller/verification/");

    if (isSellerOnboardingRoute) {
      return response;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, seller_status")
      .eq("id", user.id)
      .maybeSingle();

    const isApprovedSeller =
      profile?.role === "seller" ||
      profile?.role === "admin" ||
      profile?.seller_status === "approved";

    if (!profile || !isApprovedSeller) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

// Only run middleware on routes that require authentication.
// Static assets, _next internals, and public pages are excluded automatically.
export const config = {
  matcher: [
    "/admin/:path*",
    "/seller/:path*",
    "/account/:path*",
    "/checkout/:path*",
    "/invoices/:path*",
    "/my-orders/:path*",
    "/track/:path*",
  ],
};
