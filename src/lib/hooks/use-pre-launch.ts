"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type PreLaunchState = {
  enabled: boolean;
  launchDate: Date | null;
  loading: boolean;
};

export function usePreLaunch(): PreLaunchState & { isOrderingLocked: boolean } {
  const [state, setState] = useState<PreLaunchState>({
    enabled: false,
    launchDate: null,
    loading: true,
  });

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["pre_launch_enabled", "pre_launch_date"])
      .then(({ data }) => {
        if (!data) {
          setState({ enabled: false, launchDate: null, loading: false });
          return;
        }
        let enabled = false;
        let launchDate: Date | null = null;
        for (const row of data) {
          if (row.key === "pre_launch_enabled") enabled = row.value === "true";
          if (row.key === "pre_launch_date") launchDate = new Date(row.value);
        }
        setState({ enabled, launchDate, loading: false });
      });
  }, []);

  const isOrderingLocked = useCallback(() => {
    if (!state.enabled) return false;
    if (!state.launchDate) return true;
    return new Date() < state.launchDate;
  }, [state.enabled, state.launchDate]);

  return { ...state, isOrderingLocked: isOrderingLocked() };
}
