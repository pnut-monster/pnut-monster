"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  ToggleLeft,
  ToggleRight,
  Leaf,
  Drumstick,
  IndianRupee,
  X,
  ChevronDown,
  CheckSquare,
  XSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, cn } from "@/lib/utils/helpers";
import type { MenuItem, MenuCategory } from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface OutletMenuItem {
  item_id: string;
  is_available: boolean;
  price_override: number | null;
}

interface MenuItemWithAvailability extends MenuItem {
  category_name: string;
  is_available: boolean;
  price_override: number | null;
}

export default function RestaurantMenuPage() {
  const [items, setItems] = useState<MenuItemWithAvailability[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceEditingId, setPriceEditingId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  useEffect(() => {
    // The initial loader is a stable function declaration scoped to this page.
    // eslint-disable-next-line react-hooks/immutability
    loadMenuData();
  }, []);

  async function loadMenuData() {
    const supabase = createClient();
    const outletId = localStorage.getItem("pnut_selected_outlet");

    try {
      // Fetch all active menu items
      const { data: menuItems, error: menuError } = await supabase
        .from("menu_items")
        .select("*, menu_subcategories!inner(category_id, menu_categories!inner(name))")
        .eq("is_active", true)
        .order("sort_order");

      if (menuError) throw menuError;

      // Fetch categories
      const { data: cats, error: catError } = await supabase
        .from("menu_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (catError) throw catError;

      // Fetch outlet availability
      let outletItems: OutletMenuItem[] = [];
      if (outletId) {
        const { data: omi } = await supabase
          .from("outlet_menu_items")
          .select("item_id, is_available, price_override")
          .eq("outlet_id", outletId);

        outletItems = (omi ?? []) as OutletMenuItem[];
      }

      const outletMap = new Map(outletItems.map((o) => [o.item_id, o]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const combined: MenuItemWithAvailability[] = ((menuItems ?? []) as any[]).map((item) => {
        const outletData = outletMap.get(item.id);
        return {
          ...item,
          category_name: item.menu_subcategories?.menu_categories?.name ?? "Uncategorized",
          is_available: outletData?.is_available ?? true,
          price_override: outletData?.price_override ?? null,
        };
      });

      setCategories((cats ?? []) as MenuCategory[]);
      setItems(combined);
      setLoading(false);
      return;
    } catch (err) {
      console.error("Failed to fetch menu data:", err);
      setLoading(false);
    }
  }

  async function toggleAvailability(itemId: string) {
    const supabase = createClient();
    const outletId = localStorage.getItem("pnut_selected_outlet") ?? "";
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    if (!outletId) {
      toast.error("Select an outlet before changing availability");
      return;
    }

    const newAvailable = !item.is_available;

    try {
      const { error } = await supabase.rpc("upsert_outlet_menu_item" as never, {
        p_outlet_id: outletId,
        p_item_id: itemId,
        p_is_available: newAvailable,
        p_price_override: item.price_override,
      } as never);

      if (error) throw error;
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, is_available: newAvailable } : i
        )
      );
    } catch {
      console.error("[Restaurant Menu] Failed to toggle availability");
      toast.error("Could not update item availability");
    }
  }

  async function savePriceOverride(itemId: string) {
    const supabase = createClient();
    const outletId = localStorage.getItem("pnut_selected_outlet") ?? "";
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    if (!outletId) {
      toast.error("Select an outlet before changing prices");
      return;
    }

    const parsed = priceInput.trim() === "" ? null : parseFloat(priceInput);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
      toast.error("Enter a valid price");
      return;
    }

    try {
      const { error } = await supabase.rpc("upsert_outlet_menu_item" as never, {
        p_outlet_id: outletId,
        p_item_id: itemId,
        p_is_available: item.is_available,
        p_price_override: parsed,
      } as never);

      if (error) throw error;
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, price_override: parsed } : i
        )
      );
      setPriceEditingId(null);
      setPriceInput("");
    } catch {
      console.error("[Restaurant Menu] Failed to save price override");
      toast.error("Could not save price override");
    }
  }

  async function bulkSetAvailability(categoryName: string, available: boolean) {
    const supabase = createClient();
    const outletId = localStorage.getItem("pnut_selected_outlet") ?? "";
    if (!outletId) {
      toast.error("Select an outlet before changing availability");
      return;
    }
    const previousItems = items;

    // Update locally
    setItems((prev) =>
      prev.map((i) =>
        i.category_name === categoryName ? { ...i, is_available: available } : i
      )
    );

    setBulkMenuOpen(false);

    // Update each item in DB
    const categoryItems = items.filter((i) => i.category_name === categoryName);
    for (const item of categoryItems) {
      try {
        const { error } = await supabase.rpc("upsert_outlet_menu_item" as never, {
          p_outlet_id: outletId,
          p_item_id: item.id,
          p_is_available: available,
          p_price_override: item.price_override,
        } as never);
        if (error) throw error;
      } catch {
        console.error("[Restaurant Menu] Failed to bulk update availability");
        setItems(previousItems);
        toast.error("Could not update category availability");
        return;
        // Failed — already updated locally
      }
    }
  }

  // Filter items
  const filtered = useMemo(() => {
    let result = items;
    if (selectedCategory) {
      result = result.filter((i) => i.category_name === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, selectedCategory, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, MenuItemWithAvailability[]>();
    filtered.forEach((item) => {
      const existing = map.get(item.category_name) ?? [];
      existing.push(item);
      map.set(item.category_name, existing);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const availableCount = items.filter((i) => i.is_available).length;
  const unavailableCount = items.filter((i) => !i.is_available).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 bg-white rounded-xl animate-pulse" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm">
        <span className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 font-semibold">
          {availableCount} available
        </span>
        <span className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 font-semibold">
          {unavailableCount} unavailable
        </span>
        <span className="text-brand-gray-400 font-medium">
          {items.length} total items
        </span>
      </div>

      {/* Search and filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-gray-300 text-sm text-brand-black placeholder:text-brand-gray-400 focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-400 hover:text-brand-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors",
              !selectedCategory
                ? "bg-brand-green text-white"
                : "bg-white text-brand-gray-600 border border-brand-gray-200 hover:bg-brand-gray-50"
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.name)}
              className={cn(
                "px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors",
                selectedCategory === cat.name
                  ? "bg-brand-green text-white"
                  : "bg-white text-brand-gray-600 border border-brand-gray-200 hover:bg-brand-gray-50"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {selectedCategory && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setBulkMenuOpen(!bulkMenuOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-brand-gray-200 text-sm font-medium text-brand-gray-700 hover:shadow-sm transition-shadow"
          >
            Bulk Actions for {selectedCategory}
            <ChevronDown className={cn("w-4 h-4 transition-transform", bulkMenuOpen && "rotate-180")} />
          </button>

          {bulkMenuOpen && (
            <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-lg border border-brand-gray-200 py-1 z-10 min-w-[220px]">
              <button
                type="button"
                onClick={() => bulkSetAvailability(selectedCategory, true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-brand-gray-700 hover:bg-brand-gray-50 text-left"
              >
                <CheckSquare className="w-4 h-4 text-brand-green" />
                Mark all available
              </button>
              <button
                type="button"
                onClick={() => bulkSetAvailability(selectedCategory, false)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-brand-gray-700 hover:bg-brand-gray-50 text-left"
              >
                <XSquare className="w-4 h-4 text-brand-red" />
                Mark all unavailable
              </button>
            </div>
          )}
        </div>
      )}

      {/* Menu items grouped by category */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border border-brand-gray-200 p-8 text-center">
          <Search className="w-10 h-10 text-brand-gray-300 mx-auto mb-2" />
          <p className="text-sm text-brand-gray-500 font-medium">No items found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([categoryName, categoryItems]) => (
            <div key={categoryName}>
              <h3 className="font-heading text-base font-bold text-brand-black mb-3">
                {categoryName}
                <span className="text-brand-gray-400 font-normal ml-2 text-sm">
                  ({categoryItems.length})
                </span>
              </h3>

              <div className="space-y-2">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "bg-white rounded-xl border border-brand-gray-200 p-4 flex items-center gap-4 transition-opacity",
                      !item.is_available && "opacity-60"
                    )}
                  >
                    {/* Veg/Non-veg badge */}
                    <div className="shrink-0">
                      {item.is_veg ? (
                        <div className="w-6 h-6 rounded border-2 border-brand-green flex items-center justify-center">
                          <Leaf className="w-3.5 h-3.5 text-brand-green" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded border-2 border-brand-red flex items-center justify-center">
                          <Drumstick className="w-3.5 h-3.5 text-brand-red" />
                        </div>
                      )}
                    </div>

                    {/* Item details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-brand-black truncate">
                          {item.name}
                        </p>
                        {item.is_bestseller && (
                          <span className="text-[10px] font-bold bg-brand-yellow text-brand-black px-1.5 py-0.5 rounded-full shrink-0">
                            BEST
                          </span>
                        )}
                        {item.is_new && (
                          <span className="text-[10px] font-bold bg-brand-green text-white px-1.5 py-0.5 rounded-full shrink-0">
                            NEW
                          </span>
                        )}
                      </div>

                      {/* Price */}
                      <div className="flex items-center gap-2 mt-0.5">
                        {priceEditingId === item.id ? (
                          <div className="flex items-center gap-1">
                            <IndianRupee className="w-3 h-3 text-brand-gray-500" />
                            <input
                              type="number"
                              value={priceInput}
                              onChange={(e) => setPriceInput(e.target.value)}
                              placeholder={String(item.base_price)}
                              className="w-20 px-2 py-1 text-sm border border-brand-gray-300 rounded-lg focus:outline-none focus:border-brand-green"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") savePriceOverride(item.id);
                                if (e.key === "Escape") {
                                  setPriceEditingId(null);
                                  setPriceInput("");
                                }
                              }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => savePriceOverride(item.id)}
                              className="text-xs text-brand-green font-semibold px-2 py-1 hover:bg-green-50 rounded"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPriceEditingId(null);
                                setPriceInput("");
                              }}
                              className="text-xs text-brand-gray-400 font-semibold px-1 py-1 hover:bg-brand-gray-50 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPriceEditingId(item.id);
                              setPriceInput(
                                item.price_override !== null
                                  ? String(item.price_override)
                                  : ""
                              );
                            }}
                            className="text-sm text-brand-gray-600 hover:text-brand-green transition-colors"
                            title="Click to set outlet price"
                          >
                            {item.price_override !== null ? (
                              <>
                                <span className="line-through text-brand-gray-400 mr-1">
                                  {formatCurrency(item.base_price)}
                                </span>
                                <span className="text-brand-green font-semibold">
                                  {formatCurrency(item.price_override)}
                                </span>
                              </>
                            ) : (
                              <span className="font-semibold">
                                {formatCurrency(item.base_price)}
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Availability toggle */}
                    <button
                      type="button"
                      onClick={() => toggleAvailability(item.id)}
                      className="shrink-0 flex items-center gap-1.5"
                      aria-label={
                        item.is_available ? "Mark unavailable" : "Mark available"
                      }
                    >
                      {item.is_available ? (
                        <>
                          <ToggleRight className="w-8 h-8 text-brand-green" />
                          <span className="text-xs font-semibold text-brand-green hidden sm:inline">
                            Available
                          </span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-8 h-8 text-brand-gray-400" />
                          <span className="text-xs font-semibold text-brand-gray-400 hidden sm:inline">
                            Unavailable
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
