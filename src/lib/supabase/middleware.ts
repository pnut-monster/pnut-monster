import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;

  // Public paths — no auth needed
  const publicPaths = [
    "/login", "/register", "/verify", "/forgot-password",
    "/reset-password", "/auth/callback", "/restaurant/login",
    "/admin/login",
  ];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    // Still refresh the session cookie
    await supabase.auth.getUser();
    return supabaseResponse;
  }

  // Public customer pages — no auth needed (homepage, outlets, menu, search, cart)
  const publicCustomerPaths = ["/outlets", "/menu", "/search", "/cart"];
  const isHomepage = pathname === "/";
  if (isHomepage || publicCustomerPaths.some((p) => pathname.startsWith(p))) {
    await supabase.auth.getUser();
    return supabaseResponse;
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Admin routes — require admin/super_admin role
    if (pathname.startsWith("/admin")) {
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/login";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["admin", "super_admin"].includes(profile.role)) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/login";
        return NextResponse.redirect(url);
      }

      return supabaseResponse;
    }

    // Restaurant routes — require outlet_staff/admin/super_admin role
    if (pathname.startsWith("/restaurant")) {
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/restaurant/login";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["outlet_staff", "admin", "super_admin"].includes(profile.role)) {
        const url = request.nextUrl.clone();
        url.pathname = "/restaurant/login";
        return NextResponse.redirect(url);
      }

      return supabaseResponse;
    }

    // Protected customer routes — require any authenticated user
    const protectedPaths = ["/orders", "/wallet", "/loyalty", "/profile", "/notifications", "/referral", "/checkout"];
    if (protectedPaths.some((p) => pathname.startsWith(p)) && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  } catch {
    // Supabase unreachable — redirect to login for protected routes
    const protectedPrefixes = ["/admin", "/restaurant", "/orders", "/wallet", "/loyalty", "/profile", "/notifications", "/referral", "/checkout"];
    if (protectedPrefixes.some((p) => pathname.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
