import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  // Verify this is called by the cron scheduler (or admin)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const results = {
    windows_closed: 0,
    reservations_expired: 0,
    errors: [] as string[],
  };

  try {
    // 1. Close windows that are past their end_time
    const { data: windowsToClose } = await supabase
      .from("batch_windows")
      .select("id")
      .eq("status", "open")
      .lte("end_time", new Date().toISOString());

    if (windowsToClose && windowsToClose.length > 0) {
      for (const win of windowsToClose) {
        const { error } = await supabase.rpc("close_batch_window", { p_window_id: win.id });
        if (error) {
          results.errors.push(`Failed to close window ${win.id}: ${error.message}`);
        } else {
          results.windows_closed++;
        }
      }
    }

    // 2. Close windows that hit their max_orders cap (current_order_count >= max_orders)
    const { data: cappedWindows } = await supabase
      .from("batch_windows")
      .select("id, max_orders, current_order_count")
      .eq("status", "open");

    if (cappedWindows) {
      for (const win of cappedWindows) {
        if (win.current_order_count >= win.max_orders) {
          const { error } = await supabase.rpc("close_batch_window", { p_window_id: win.id });
          if (error) {
            results.errors.push(`Failed to close capped window ${win.id}: ${error.message}`);
          } else {
            results.windows_closed++;
          }
        }
      }
    }

    // 3. Expire held slot reservations
    const { data: expiredCount } = await supabase.rpc("expire_batch_reservations");
    results.reservations_expired = expiredCount ?? 0;

  } catch (err) {
    results.errors.push(`Unexpected error: ${String(err)}`);
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
