import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/verify",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/restaurant/login",
  "/admin/login",
];

const PUBLIC_CUSTOMER_PATHS = ["/outlets", "/menu", "/search", "/cart"];
const PROTECTED_CUSTOMER_PATHS = [
  "/orders",
  "/wallet",
  "/loyalty",
  "/profile",
  "/notifications",
  "/addresses",
  "/support",
  "/about",
  "/referral",
  "/checkout",
];

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
  const matchesPath = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  const isAdminRoute = matchesPath("/admin");
  const isRestaurantRoute = matchesPath("/restaurant");
  const isProtectedCustomerRoute = PROTECTED_CUSTOMER_PATHS.some(matchesPath);
  const isHomepage = pathname === "/";

  if (
    PUBLIC_PATHS.some(matchesPath) ||
    isHomepage ||
    PUBLIC_CUSTOMER_PATHS.some(matchesPath)
  ) {
    return NextResponse.next({ request });
  }

  if (!isAdminRoute && !isRestaurantRoute && !isProtectedCustomerRoute) {
    return NextResponse.next({ request });
  }

  const storageKey = isAdminRoute
    ? "sb-admin-auth-token"
    : "sb-customer-auth-token";
  const { supabase, getResponse } = createSupabaseMiddlewareClient(
    request,
    storageKey
  );

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    if (isRestaurantRoute) {
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

      if (
        !profile ||
        !["outlet_staff", "admin", "super_admin"].includes(profile.role)
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/restaurant/login";
        return NextResponse.redirect(url);
      }

      return getResponse();
    }

    if (isProtectedCustomerRoute && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = isAdminRoute
      ? "/admin/login"
      : isRestaurantRoute
        ? "/restaurant/login"
        : "/login";
    return NextResponse.redirect(url);
  }

  return getResponse();
}
