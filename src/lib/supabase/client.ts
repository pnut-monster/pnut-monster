import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let browserClient: BrowserClient | null = null;
let adminBrowserClient: BrowserClient | null = null;

function resolveSupabaseUrlForBrowser(rawUrl: string): string {
  if (typeof window === "undefined") return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
    if (!localHosts.has(parsed.hostname)) return rawUrl;

    const browserHost = window.location.hostname;
    if (localHosts.has(browserHost)) return rawUrl;

    return `${window.location.origin}/supabase`;
  } catch {
    return rawUrl;
  }
}

function isAdminPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/admin");
}

export function createClient() {
  const supabaseUrl = resolveSupabaseUrlForBrowser(
    process.env.NEXT_PUBLIC_SUPABASE_URL!
  );

  const isAdmin = isAdminPath();

  if (typeof window !== "undefined") {
    if (isAdmin && adminBrowserClient) return adminBrowserClient;
    if (!isAdmin && browserClient) return browserClient;
  }

  const client = createBrowserClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
      cookieOptions: {
        name: isAdmin ? "sb-admin-auth-token" : "sb-customer-auth-token",
      },
    }
  );

  if (typeof window !== "undefined") {
    if (isAdmin) {
      adminBrowserClient = client;
    } else {
      browserClient = client;
    }
  }

  return client;
}
