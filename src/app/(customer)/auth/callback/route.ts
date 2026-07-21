import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error_description");
  const next = safeNextPath(url.searchParams.get("next"));

  if (providerError || !code) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set(
      "error",
      providerError ?? "Google did not return an authentication code."
    );
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient("sb-customer-auth-token");
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "Google sign-in completed without a user session.");
    return NextResponse.redirect(loginUrl);
  }

  const metadataName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : typeof user.user_metadata.name === "string"
        ? user.user_metadata.name.trim()
        : "";
  const metadataAvatar =
    typeof user.user_metadata.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : typeof user.user_metadata.picture === "string"
        ? user.user_metadata.picture
        : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();
  const customerProfile = profile as {
    full_name: string | null;
    avatar_url: string | null;
  } | null;

  if (customerProfile && (metadataName || metadataAvatar)) {
    await supabase
      .from("profiles")
      .update({
        full_name: customerProfile.full_name || metadataName || null,
        avatar_url: customerProfile.avatar_url || metadataAvatar,
      } as never)
      .eq("id", user.id);
  }

  const destination = customerProfile?.full_name || metadataName ? next : "/profile-setup";
  return NextResponse.redirect(new URL(destination, url.origin));
}
