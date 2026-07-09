import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function createSupabaseMiddlewareClient(
  request: NextRequest,
  storageKey: string
) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: storageKey,
      },
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

  return { supabase, getResponse: () => supabaseResponse };
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const matchesPath = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  const isAdminRoute = matchesPath("/admin");
  const storageKey = isAdminRoute ? "sb-admin-auth-token" : "sb-customer-auth-token";

  const { supabase, getResponse } = createSupabaseMiddlewareClient(request, storageKey);

  // Public paths — no auth needed
  const publicPaths = [
    "/login", "/register", "/verify", "/forgot-password",
    "/reset-password", "/auth/callback", "/restaurant/login",
    "/admin/login",
  ];
  if (publicPaths.some(matchesPath)) {
    await supabase.auth.getUser();
    return getResponse();
  }

  // Public customer pages — no auth needed (homepage, outlets, menu, search, cart)
  const publicCustomerPaths = ["/outlets", "/menu", "/search", "/cart"];
  const isHomepage = pathname === "/";
  if (isHomepage || publicCustomerPaths.some(matchesPath)) {
    await supabase.auth.getUser();
    return getResponse();
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Admin routes — require admin/super_admin role
    if (isAdminRoute) {
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

      return getResponse();
    }

    // Restaurant routes — require outlet_staff/admin/super_admin role
    if (matchesPath("/restaurant")) {
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

      return getResponse();
    }

    // Protected customer routes — require any authenticated user
    const protectedPaths = ["/orders", "/wallet", "/loyalty", "/profile", "/notifications", "/referral", "/checkout"];
    if (protectedPaths.some(matchesPath) && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  } catch {
    // Supabase unreachable — redirect to login for protected routes
    const protectedPrefixes = ["/admin", "/restaurant", "/orders", "/wallet", "/loyalty", "/profile", "/notifications", "/referral", "/checkout"];
    if (protectedPrefixes.some(matchesPath)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return getResponse();
}
