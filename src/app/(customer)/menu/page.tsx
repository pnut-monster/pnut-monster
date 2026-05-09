"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Plus, Leaf, Star, Sparkles, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOutletStore } from "@/lib/stores/outlet-store";
import { useCartStore } from "@/lib/stores/cart-store";
import { formatCurrency, cn } from "@/lib/utils/helpers";
import { getImageUrl } from "@/lib/utils/image";
import type { MenuCategory, MenuSubcategory, MenuItem } from "@/lib/supabase/types";

interface CategoryWithItems extends MenuCategory {
  subcategories: (MenuSubcategory & { items: MenuItem[] })[];
}

export default function MenuPage() {
  const [categories, setCategories] = useState<CategoryWithItems[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tabsRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const router = useRouter();
  const { selectedOutlet } = useOutletStore();
  const { getItemCount } = useCartStore();
  const supabase = createClient();
  const itemCount = getItemCount();

  useEffect(() => {
    if (!selectedOutlet) {
      router.push("/outlets");
      return;
    }

    async function fetchMenu() {
      let cats: MenuCategory[] | null = null;
      let subcats: (MenuSubcategory & { menu_items: MenuItem[] })[] | null = null;
      let availability: { item_id: string; is_available: boolean; price_override: number | null }[] | null = null;

      try {
        // Get categories
        const { data: catsData } = await supabase
          .from("menu_categories")
          .select("*")
          .eq("is_active", true)
          .order("sort_order");

        cats = catsData as MenuCategory[] | null;

        // Get subcategories with items
        const { data: subcatsData } = await supabase
          .from("menu_subcategories")
          .select("*, menu_items(*)")
          .eq("is_active", true)
          .order("sort_order");

        subcats = subcatsData as (MenuSubcategory & { menu_items: MenuItem[] })[] | null;

        // Get availability for this outlet
        const { data: availData } = await supabase
          .from("outlet_menu_items")
          .select("item_id, is_available, price_override")
          .eq("outlet_id", selectedOutlet!.id);

        availability = availData as { item_id: string; is_available: boolean; price_override: number | null }[] | null;
      } catch (err) {
        console.error("Failed to fetch menu:", err);
      }

      if (!cats || cats.length === 0) {
        setLoading(false);
        return;
      }

      if (!subcats) return;

      const availMap = new Map(
        availability?.map((a) => [a.item_id, a] as const) ?? []
      );

      // Assemble categories with filtered items
      const assembled: CategoryWithItems[] = cats.map((cat) => ({
        ...cat,
        subcategories: subcats!
          .filter((sc) => sc.category_id === cat.id)
          .map((sc) => ({
            ...sc,
            items: sc.menu_items
              .filter((item) => {
                const avail = availMap.get(item.id);
                return item.is_active && (!avail || avail.is_available);
              })
              .map((item) => {
                const avail = availMap.get(item.id);
                return {
                  ...item,
                  base_price: avail?.price_override ?? item.base_price,
                };
              }),
          }))
          .filter((sc) => sc.items.length > 0),
      })).filter((cat) => cat.subcategories.length > 0);

      setCategories(assembled);
      if (assembled.length > 0) {
        setActiveCategory(assembled[0].id);
      }
      setLoading(false);
    }

    fetchMenu();
  }, [selectedOutlet, router, supabase]);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream">
        <div className="sticky top-0 z-10 bg-white px-4 py-3 shadow-sm">
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
    <div className="min-h-screen bg-brand-cream pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.push("/outlets")} className="text-brand-gray-500">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-[family-name:var(--font-heading)] text-lg font-bold text-brand-black">
              Menu
            </h1>
            <p className="text-xs text-brand-gray-500">{selectedOutlet?.name}</p>
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
            className="flex w-full items-center justify-between rounded-2xl bg-brand-black px-5 py-3.5 text-white shadow-lg transition-transform active:scale-[0.98]"
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

function MenuItemCard({ item }: { item: MenuItem }) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/menu/${item.slug}`)}
      className="flex w-full items-start gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition-all active:scale-[0.98]"
    >
      {/* Image placeholder */}
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-brand-gray-100">
        {item.image_url ? (
          <img src={getImageUrl(item.image_url) ?? ""} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Leaf className="h-8 w-8 text-brand-green/30" />
          </div>
        )}
        {item.is_veg && (
          <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-sm border border-brand-green bg-white">
            <span className="h-2 w-2 rounded-full bg-brand-green" />
          </span>
        )}
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
          <span className="font-[family-name:var(--font-heading)] text-sm font-bold text-brand-black">
            {formatCurrency(item.base_price)}
          </span>
          <span className="flex items-center gap-1 rounded-lg bg-brand-yellow/10 px-2.5 py-1 text-xs font-bold text-brand-yellow-dark">
            <Plus className="h-3 w-3" /> ADD
          </span>
        </div>
      </div>
    </button>
  );
}
