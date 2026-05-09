import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Outlet } from "@/lib/supabase/types";

interface OutletState {
  selectedOutlet: Outlet | null;
  setOutlet: (outlet: Outlet) => void;
  clearOutlet: () => void;
}

export const useOutletStore = create<OutletState>()(
  persist(
    (set) => ({
      selectedOutlet: null,
      setOutlet: (outlet) => set({ selectedOutlet: outlet }),
      clearOutlet: () => set({ selectedOutlet: null }),
    }),
    {
      name: "pnut-outlet",
    }
  )
);
