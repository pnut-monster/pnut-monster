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
  "/referral-claim",
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

    if (!user && isProtectedCustomerRoute) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        return getResponse();
      }
    }

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

      const { data: mfaSetting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "require_2fa")
        .maybeSingle();
      const is2faRequired = !mfaSetting || mfaSetting.value !== "false";

      const isMfaRoute =
        pathname === "/admin/mfa/setup" || pathname === "/admin/mfa/verify";
      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (assuranceError) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/login";
        return NextResponse.redirect(url);
      }

      if (is2faRequired && !isMfaRoute && assurance.currentLevel !== "aal2") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const hasVerifiedTotp = factors?.totp.some(
          (factor) => factor.status === "verified"
        );
        const url = request.nextUrl.clone();
        url.pathname = hasVerifiedTotp
          ? "/admin/mfa/verify"
          : "/admin/mfa/setup";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
      }

      if (pathname === "/admin/mfa/setup" && assurance.currentLevel === "aal2") {
        const url = request.nextUrl.clone();
        url.pathname = "/admin";
        url.search = "";
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
    if (isAdminRoute || isRestaurantRoute) {
      const url = request.nextUrl.clone();
      url.pathname = isAdminRoute ? "/admin/login" : "/restaurant/login";
      return NextResponse.redirect(url);
    }
  }

  return getResponse();
}
