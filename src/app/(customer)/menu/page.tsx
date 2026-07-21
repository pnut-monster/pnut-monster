"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShoppingBag, Plus, Leaf, Star, Sparkles, ChevronLeft, MapPin, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { useCartStore } from "@/lib/stores/cart-store";
import { formatCurrency, cn } from "@/lib/utils/helpers";
import { getImageUrl } from "@/lib/utils/image";
import type { MenuCategory, MenuSubcategory, MenuItem, Outlet } from "@/lib/supabase/types";

type MenuCategorySummary = Pick<
  MenuCategory,
  "id" | "name" | "slug" | "description" | "sort_order" | "is_active"
>;
type MenuSubcategorySummary = Pick<
  MenuSubcategory,
  "id" | "category_id" | "name" | "slug" | "sort_order" | "is_active"
>;
type MenuItemSummary = Pick<
  MenuItem,
  | "id"
  | "subcategory_id"
  | "name"
  | "slug"
  | "description"
  | "image_url"
  | "base_price"
  | "is_veg"
  | "is_bestseller"
  | "is_new"
  | "is_active"
  | "sort_order"
>;

interface CategoryWithItems extends MenuCategorySummary {
  subcategories: (MenuSubcategorySummary & { items: MenuItemSummary[] })[];
}

let cachedOutlets: Outlet[] | null = null;
const menuCache = new Map<string, CategoryWithItems[]>();

export default function MenuPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletsLoading, setOutletsLoading] = useState(true);
  const [outletChosen, setOutletChosen] = useState(false);
  const [categories, setCategories] = useState<CategoryWithItems[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const router = useRouter();
  const selectedOutlet = useOutletStore((state) => state.selectedOutlet);
  const setOutlet = useOutletStore((state) => state.setOutlet);
  const setCartOutlet = useCartStore((state) => state.setOutlet);
  const itemCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchOutlets() {
      if (cachedOutlets) {
        setOutlets(cachedOutlets);
        setOutletsLoading(false);
      }

      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("outlets")
          .select("*")
          .eq("is_active", true)
          .order("name");

        if (cancelled) return;
        const nextOutlets = (data as Outlet[] | null) ?? [];
        cachedOutlets = nextOutlets;
        setOutlets(nextOutlets);
      } catch (err) {
        console.error("Failed to fetch outlets:", err);
        if (!cancelled && !cachedOutlets) setOutlets([]);
      } finally {
        if (!cancelled) setOutletsLoading(false);
      }
    }

    fetchOutlets();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedOutlet) {
      setOutletChosen(true);
    }
  }, [selectedOutlet]);

  useEffect(() => {
    if (!selectedOutlet || !outletChosen) {
      setCategories([]);
      setActiveCategory(null);
      setLoading(false);
      return;
    }

    const outletId = selectedOutlet.id;
    const cachedMenu = menuCache.get(outletId);

    if (cachedMenu) {
      setCategories(cachedMenu);
      setActiveCategory((current) =>
        current && cachedMenu.some((cat) => cat.id === current)
          ? current
          : cachedMenu[0]?.id ?? null
      );
      setLoading(false);
    } else {
      setLoading(true);
    }

    let cancelled = false;

    async function fetchMenu() {
      const supabase = createClient();

      try {
        const [categoriesResult, subcategoriesResult, availabilityResult] =
          await Promise.all([
            supabase
              .from("menu_categories")
              .select("id, name, slug, description, sort_order, is_active")
              .eq("is_active", true)
              .order("sort_order"),
            supabase
              .from("menu_subcategories")
              .select(`
                id,
                category_id,
                name,
                slug,
                sort_order,
                is_active,
                menu_items (
                  id,
                  subcategory_id,
                  name,
                  slug,
                  description,
                  image_url,
                  base_price,
                  is_veg,
                  is_bestseller,
                  is_new,
                  is_active,
                  sort_order
                )
              `)
              .eq("is_active", true)
              .order("sort_order"),
            supabase
              .from("outlet_menu_items")
              .select("item_id, is_available, price_override")
              .eq("outlet_id", outletId),
          ]);

        if (cancelled) return;

        const cats = categoriesResult.data as MenuCategorySummary[] | null;
        const subcats = subcategoriesResult.data as
          | (MenuSubcategorySummary & { menu_items: MenuItemSummary[] })[]
          | null;
        const availability = availabilityResult.data as
          | {
              item_id: string;
              is_available: boolean;
              price_override: number | null;
            }[]
          | null;

        if (!cats?.length || !subcats) {
          setCategories([]);
          setActiveCategory(null);
          return;
        }

        const availMap = new Map(availability?.map((a) => [a.item_id, a] as const) ?? []);
        const subcategoriesByCategory = new Map<string, CategoryWithItems["subcategories"]>();

        for (const subcategory of subcats) {
          const items = subcategory.menu_items.reduce<MenuItemSummary[]>((visibleItems, item) => {
            const avail = availMap.get(item.id);
            if (!item.is_active || avail?.is_available === false) return visibleItems;
            visibleItems.push({
              ...item,
              base_price: avail?.price_override ?? item.base_price,
            });
            return visibleItems;
          }, []);

          if (items.length === 0) continue;
          const existing = subcategoriesByCategory.get(subcategory.category_id) ?? [];
          existing.push({ ...subcategory, items });
          subcategoriesByCategory.set(subcategory.category_id, existing);
        }

        const assembled: CategoryWithItems[] = cats.reduce<CategoryWithItems[]>(
          (visibleCategories, cat) => {
            const visibleSubcategories = subcategoriesByCategory.get(cat.id) ?? [];
            if (visibleSubcategories.length > 0) {
              visibleCategories.push({ ...cat, subcategories: visibleSubcategories });
            }
            return visibleCategories;
          },
          []
        );

        menuCache.set(outletId, assembled);
        setCategories(assembled);
        setActiveCategory((current) =>
          current && assembled.some((cat) => cat.id === current)
            ? current
            : assembled[0]?.id ?? null
        );
      } catch (err) {
        console.error("Failed to fetch menu:", err);
        if (!cachedMenu) {
          setCategories([]);
          setActiveCategory(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMenu();

    return () => {
      cancelled = true;
    };
  }, [selectedOutlet, outletChosen]);

  useEffect(() => {
    if (categories.length === 0) return;
    const requestedSlug = new URLSearchParams(window.location.search).get("category");
    if (!requestedSlug) return;
    const requestedCategory = categories.find((category) => category.slug === requestedSlug);
    if (!requestedCategory) return;
    setActiveCategory(requestedCategory.id);
    requestAnimationFrame(() => {
      sectionRefs.current[requestedCategory.id]?.scrollIntoView({ block: "start" });
    });
  }, [categories]);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleOutletSelect = (outlet: Outlet) => {
    setOutlet(outlet);
    setCartOutlet(outlet.id);
    setOutletChosen(true);
  };

  const isOpen = (outlet: Outlet) => {
    return outlet.is_active && !outlet.is_manually_closed;
  };

  if (!outletChosen) {
    return (
      <div className="min-h-screen bg-[#FAFBFC]">
        <div className="sticky top-0 z-10 bg-white px-4 py-4 shadow-sm border-b border-brand-gray-200">
          <h1 className="font-[family-name:var(--font-heading)] text-xl font-bold text-brand-black">
            Choose Outlet
          </h1>
          <p className="mt-1 text-sm text-brand-gray-500">
            Menu items will be shown based on the selected outlet.
          </p>
        </div>

        <div className="px-4 py-4">
          {outletsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          ) : outlets.length === 0 ? (
            <div className="py-20 text-center">
              <MapPin className="mx-auto mb-3 h-12 w-12 text-brand-gray-300" />
              <p className="font-[family-name:var(--font-heading)] text-lg text-brand-gray-500">
                No outlets available
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {outlets.map((outlet) => {
                const open = isOpen(outlet);
                return (
                  <button
                    key={outlet.id}
                    onClick={() => handleOutletSelect(outlet)}
                    disabled={!open}
                    className={cn(
                      "w-full rounded-2xl bg-white p-4 text-left shadow-sm transition-all active:scale-[0.98]",
                      open ? "hover:shadow-md" : "opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-[family-name:var(--font-heading)] text-base font-bold text-brand-black">
                          {outlet.name}
                        </h3>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-brand-gray-500">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{outlet.address}</span>
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                              open
                                ? "bg-brand-green/10 text-brand-green"
                                : "bg-brand-red/10 text-brand-red"
                            )}
                          >
                            <Clock className="h-3 w-3" />
                            {open ? "Open Now" : "Closed"}
                          </span>
                        </div>
                      </div>
                      {selectedOutlet?.id === outlet.id && (
                        <span className="rounded-full bg-brand-yellow/10 px-2.5 py-1 text-xs font-bold text-brand-yellow-dark">
                          Selected
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFBFC]">
        <div className="sticky top-0 z-10 bg-white px-4 py-3 shadow-sm border-b border-brand-gray-200">
          <div className="h-6 w-32 animate-pulse rounded bg-brand-gray-200" />
          <div className="mt-3 flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-brand-gray-100" />
            ))}
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFBFC] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm border-b border-brand-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.push("/outlets")} className="text-brand-gray-500 hover:text-brand-black transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">MENU</p>
            <h1 className="font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black">
              {selectedOutlet?.name}
            </h1>
          </div>
        </div>

        {/* Category Tabs */}
        <div
          ref={tabsRef}
          className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3"
        >
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                activeCategory === cat.id
                  ? "bg-brand-yellow text-brand-black"
                  : "bg-brand-gray-100 text-brand-gray-600"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Sections */}
      <div className="px-4 py-4">
        {categories.map((category) => (
          <div
            key={category.id}
            ref={(el) => { sectionRefs.current[category.id] = el; }}
            className="mb-6"
          >
            <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black">
              {category.name}
            </h2>
            {category.description && (
              <p className="mb-3 text-sm text-brand-gray-500">{category.description}</p>
            )}

            {category.subcategories.map((subcategory) => (
              <div key={subcategory.id} className="mb-4">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-brand-gray-400">
                  {subcategory.name}
                </h3>

                <div className="space-y-3">
                  {subcategory.items.map((item) => (
                    <MenuItemCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Cart Bar */}
      {itemCount > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-20">
          <button
            onClick={() => router.push("/cart")}
            className="flex w-full items-center justify-between rounded-2xl bg-brand-black px-5 py-3.5 text-white shadow-2xl hover:shadow-3xl transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              <span className="font-semibold">
                {itemCount} {itemCount === 1 ? "item" : "items"} in cart
              </span>
            </div>
            <span className="font-[family-name:var(--font-heading)] font-bold">View Cart →</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItemCard({ item }: { item: MenuItemSummary }) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/menu/${item.slug}`)}
      className="flex w-full items-start gap-3 rounded-2xl bg-white p-3 text-left border border-brand-gray-200 hover:border-brand-yellow hover:shadow-lg transition-all active:scale-[0.98]"
    >
      {/* Image placeholder */}
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-white">
        {item.image_url ? (
          <Image
            src={getImageUrl(item.image_url) ?? ""}
            alt={item.name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Leaf className="h-8 w-8 text-brand-green/30" />
          </div>
        )}
        {/* Veg/Non-veg indicator */}
        <div className={`absolute top-1 right-1 w-4 h-4 rounded-sm border-2 flex items-center justify-center ${
          item.is_veg ? "border-green-600 bg-white" : "border-red-600 bg-white"
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            item.is_veg ? "bg-green-600" : "bg-red-600"
          }`} />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-start gap-1">
          <h4 className="font-[family-name:var(--font-heading)] text-sm font-bold text-brand-black">
            {item.name}
          </h4>
          {item.is_bestseller && (
            <Star className="h-3.5 w-3.5 flex-shrink-0 fill-brand-yellow text-brand-yellow" />
          )}
          {item.is_new && (
            <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-brand-orange" />
          )}
        </div>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-brand-gray-500">{item.description}</p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="font-[family-name:var(--font-heading)] text-base font-bold text-brand-black">
            {formatCurrency(item.base_price)}
          </span>
          <span className="flex items-center gap-1 rounded-xl bg-brand-yellow hover:bg-brand-yellow-dark px-3 py-1.5 text-xs font-bold text-brand-black transition-colors shadow-sm">
            <Plus className="h-3.5 w-3.5" /> ADD
          </span>
        </div>
      </div>
    </button>
  );
}
