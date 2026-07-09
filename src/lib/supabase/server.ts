import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

type AuthStorageKey = "sb-admin-auth-token" | "sb-customer-auth-token";

function resolveStorageKey(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  storageKey?: AuthStorageKey
): AuthStorageKey {
  if (storageKey) return storageKey;

  const names = new Set(cookieStore.getAll().map((cookie) => cookie.name));
  return names.has("sb-admin-auth-token")
    ? "sb-admin-auth-token"
    : "sb-customer-auth-token";
}

export async function createClient(storageKey?: AuthStorageKey) {
  const cookieStore = await cookies();
  const cookieName = resolveStorageKey(cookieStore, storageKey);

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: cookieName,
      },
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
            // The `setAll` method is called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
