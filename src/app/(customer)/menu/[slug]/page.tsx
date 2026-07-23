"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCartStore, type CartCustomization } from "@/lib/stores/cart-store";
import type {
  MenuItem,
  CustomizationGroup,
  CustomizationOption,
} from "@/lib/supabase/types";
import { formatCurrency, cn } from "@/lib/utils/helpers";
import { getImageUrl } from "@/lib/utils/image";
import {
  ChevronLeft,
  Plus,
  Minus,
  Check,
  Leaf,
  Star,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import toast from "react-hot-toast";

// Step type ordering
const STEP_ORDER: CustomizationGroup["type"][] = [
  "base",
  "topping",
  "flavour",
  "extra",
];

const STEP_LABELS: Record<CustomizationGroup["type"], string> = {
  base: "Base",
  topping: "Toppings",
  flavour: "Flavour",
  extra: "Extras",
};

type GroupWithOptions = CustomizationGroup & { options: CustomizationOption[] };

// Selections keyed by group_id -> set of option ids
type Selections = Record<string, Set<string>>;

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const addItem = useCartStore((s) => s.addItem);

  const [item, setItem] = useState<MenuItem | null>(null);
  const [groups, setGroups] = useState<GroupWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Selections>({});
  const [quantity, setQuantity] = useState(1);

  // Fetch item data
  useEffect(() => {
    async function fetchItem() {
      setLoading(true);
      setError(null);

      let menuItem: MenuItem | null = null;
      let fetchedGroups: CustomizationGroup[] = [];
      let fetchedOptions: CustomizationOption[] = [];

      try {
        const supabase = createClient();

        // 1. Fetch item by slug
        const { data: itemData, error: itemError } = await supabase
          .from("menu_items")
          .select("*")
          .eq("slug", slug)
          .eq("is_active", true)
          .single();

        if (itemError || !itemData) {
          setError("Item not found");
          setLoading(false);
          return;
        } else {
          menuItem = itemData as MenuItem;

          // 2. Fetch customization groups for this item
          const { data: groupsData } = await supabase
            .from("item_customization_groups")
            .select("*")
            .eq("item_id", menuItem.id)
            .order("sort_order", { ascending: true });

          fetchedGroups = (groupsData ?? []) as CustomizationGroup[];

          if (fetchedGroups.length > 0) {
            // 3. Fetch all options for these groups
            const groupIds = fetchedGroups.map((g) => g.id);
            const { data: optionsData } = await supabase
              .from("customization_options")
              .select("*")
              .in("group_id", groupIds)
              .eq("is_active", true)
              .order("sort_order", { ascending: true });

            fetchedOptions = (optionsData ?? []) as CustomizationOption[];
          }
        }
      } catch (err) {
        console.error("Failed to fetch item:", err);
        setError("Failed to load item. Please try again.");
        setLoading(false);
        return;
      }

      setItem(menuItem);

      if (fetchedGroups.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      // 4. Merge options into groups
      const optionsByGroup = new Map<string, CustomizationOption[]>();
      for (const option of fetchedOptions) {
        const existing = optionsByGroup.get(option.group_id) ?? [];
        existing.push(option);
        optionsByGroup.set(option.group_id, existing);
      }

      const groupsWithOptions: GroupWithOptions[] = fetchedGroups.map((g) => ({
        ...g,
        options: optionsByGroup.get(g.id) ?? [],
      }));

      setGroups(groupsWithOptions);

      // Pre-select default options
      const defaultSelections: Selections = {};
      for (const group of groupsWithOptions) {
        const defaults = group.options
          .filter((o) => o.is_default)
          .map((o) => o.id);
        if (defaults.length > 0) {
          defaultSelections[group.id] = new Set(defaults);
        }
      }
      setSelections(defaultSelections);

      setLoading(false);
    }

    fetchItem();
  }, [slug]);

  // Filter and order the steps that exist for this item
  const steps = useMemo(() => {
    return STEP_ORDER.filter((type) =>
      groups.some((g) => g.type === type)
    );
  }, [groups]);

  // The groups for the current step
  const currentStepGroups = useMemo(() => {
    if (steps.length === 0) return [];
    const stepType = steps[currentStep];
    if (!stepType) return [];
    return groups.filter((g) => g.type === stepType);
  }, [groups, steps, currentStep]);

  // Whether we're on the summary step (past all customization steps)
  const isSummaryStep = currentStep >= steps.length;

  // Total number of steps including summary
  const totalSteps = steps.length + 1;

  // Calculate running total
  const runningTotal = useMemo(() => {
    if (!item) return 0;
    let total = item.base_price;
    for (const group of groups) {
      const selected = selections[group.id];
      if (!selected) continue;
      for (const opt of group.options) {
        if (selected.has(opt.id)) {
          total += opt.price;
        }
      }
    }
    return total;
  }, [item, groups, selections]);

  // Toggle an option selection
  const toggleOption = useCallback(
    (group: GroupWithOptions, optionId: string) => {
      setSelections((prev) => {
        const current = new Set(prev[group.id] ?? []);

        if (group.max_select === 1) {
          // Single select (radio-style)
          const next = new Set<string>();
          if (!current.has(optionId)) {
            next.add(optionId);
          }
          return { ...prev, [group.id]: next };
        }

        // Multi select (checkbox-style)
        if (current.has(optionId)) {
          current.delete(optionId);
        } else {
          if (current.size < group.max_select) {
            current.add(optionId);
          } else {
            toast.error(`Max ${group.max_select} selections allowed`);
            return prev;
          }
        }
        return { ...prev, [group.id]: new Set(current) };
      });
    },
    []
  );

  // Validate current step before advancing
  const canAdvance = useMemo(() => {
    if (isSummaryStep) return true;
    for (const group of currentStepGroups) {
      const selected = selections[group.id];
      const count = selected?.size ?? 0;
      if (group.is_required && count < group.min_select) {
        return false;
      }
    }
    return true;
  }, [currentStepGroups, selections, isSummaryStep]);

  // Validation message
  const validationMessage = useMemo(() => {
    if (isSummaryStep) return null;
    for (const group of currentStepGroups) {
      const selected = selections[group.id];
      const count = selected?.size ?? 0;
      if (group.is_required && count < group.min_select) {
        return `Please select at least ${group.min_select} option${group.min_select > 1 ? "s" : ""} for ${group.name}`;
      }
    }
    return null;
  }, [currentStepGroups, selections, isSummaryStep]);

  const handleNext = () => {
    if (!canAdvance) {
      if (validationMessage) toast.error(validationMessage);
      return;
    }
    setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const handleAddToCart = () => {
    if (!item) return;

    const customizations: CartCustomization[] = [];
    for (const group of groups) {
      const selected = selections[group.id];
      if (!selected || selected.size === 0) continue;
      const selectedOptions = group.options
        .filter((o) => selected.has(o.id))
        .map((o) => ({ id: o.id, name: o.name, price: o.price }));
      customizations.push({
        group_id: group.id,
        group_name: group.name,
        options: selectedOptions,
      });
    }

    addItem({
      item_id: item.id,
      name: item.name,
      image_url: item.image_url,
      base_price: item.base_price,
      quantity,
      customizations,
      total_price: runningTotal * quantity,
    });

    toast.success(`${item.name} added to cart!`);
    router.back();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFBFC] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#F5B731] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-[#FAFBFC] flex flex-col items-center justify-center gap-4 px-6">
        <p className="font-[family-name:var(--font-body)] text-[#1A1A1A] text-lg">
          {error ?? "Item not found"}
        </p>
        <button
          onClick={() => router.back()}
          className="px-6 py-3 bg-[#F5B731] text-[#1A1A1A] font-[family-name:var(--font-heading)] font-semibold rounded-xl"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFBFC] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-brand-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-brand-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-brand-black" />
          </button>
          <div>
            <p className="text-[10px] font-bold text-brand-gray-500 uppercase tracking-wider">ITEM DETAILS</p>
            <h1 className="font-[family-name:var(--font-heading)] text-brand-black font-bold text-base truncate">
              {item.name}
            </h1>
          </div>
        </div>
      </div>

      {/* Item Hero */}
      <div className="px-4 pt-4 pb-2">
        {/* Image */}
        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-white border border-brand-gray-200">
          {item.image_url ? (
            <Image
              src={getImageUrl(item.image_url) ?? ""}
              alt={item.name}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FFF8E7] to-[#F5B731]/20">
              <Leaf className="w-16 h-16 text-[#4CAF50]/50" />
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-3 left-3 flex gap-2">
            {item.is_bestseller && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-[#F5B731] text-[#1A1A1A] rounded-full text-xs font-[family-name:var(--font-body)] font-bold shadow-sm">
                <Star className="w-3 h-3" fill="currentColor" />
                Bestseller
              </span>
            )}
            {item.is_new && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-[#4CAF50] text-white rounded-full text-xs font-[family-name:var(--font-body)] font-bold shadow-sm">
                <Sparkles className="w-3 h-3" />
                New
              </span>
            )}
          </div>

          {/* Veg/Non-veg badge */}
          <div className="absolute top-3 right-3">
            <div
              className={cn(
                "w-6 h-6 rounded border-2 flex items-center justify-center bg-white",
                item.is_veg ? "border-[#4CAF50]" : "border-red-500"
              )}
            >
              <div
                className={cn(
                  "w-3 h-3 rounded-full",
                  item.is_veg ? "bg-[#4CAF50]" : "bg-red-500"
                )}
              />
            </div>
          </div>
        </div>

        {/* Item Info */}
        <div className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-bold text-2xl">
              {item.name}
            </h2>
            <span className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-bold text-xl whitespace-nowrap">
              {formatCurrency(item.base_price)}
            </span>
          </div>
          {item.description && (
            <p className="mt-1 font-[family-name:var(--font-body)] text-[#1A1A1A]/60 text-sm leading-relaxed">
              {item.description}
            </p>
          )}
        </div>
      </div>

      {/* Customization Builder */}
      {steps.length > 0 && (
        <div className="px-4 mt-4">
          {/* Step indicators */}
          <div className="flex items-center gap-1 mb-4">
            {steps.map((type, i) => (
              <div key={type} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-[family-name:var(--font-body)] font-bold transition-colors",
                      i < currentStep
                        ? "bg-[#4CAF50] text-white"
                        : i === currentStep && !isSummaryStep
                          ? "bg-[#F5B731] text-[#1A1A1A]"
                          : "bg-[#1A1A1A]/10 text-[#1A1A1A]/40"
                    )}
                  >
                    {i < currentStep ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] mt-1 font-[family-name:var(--font-body)] font-semibold",
                      i === currentStep && !isSummaryStep
                        ? "text-[#1A1A1A]"
                        : "text-[#1A1A1A]/40"
                    )}
                  >
                    {STEP_LABELS[type]}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 -mt-4 mx-1 rounded transition-colors",
                      i < currentStep ? "bg-[#4CAF50]" : "bg-[#1A1A1A]/10"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="relative overflow-hidden min-h-[200px]">
            {!isSummaryStep ? (
              <div key={currentStep}>
                {currentStepGroups.map((group) => (
                  <div key={group.id} className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-semibold text-base">
                        {group.name}
                      </h3>
                      <span className="text-xs font-[family-name:var(--font-body)] text-[#1A1A1A]/50">
                        {group.is_required ? "Required" : "Optional"}
                        {group.max_select > 1 &&
                          ` \u00b7 Pick ${group.min_select}${group.min_select !== group.max_select ? `-${group.max_select}` : ""}`}
                        {group.max_select === 1 && " \u00b7 Pick 1"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {group.options.map((option) => {
                        const isSelected =
                          selections[group.id]?.has(option.id) ?? false;
                        return (
                          <button
                            key={option.id}
                            onClick={() => toggleOption(group, option.id)}
                            className={cn(
                              "relative flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left",
                              isSelected
                                ? "border-[#F5B731] bg-[#F5B731]/10 shadow-sm"
                                : "border-[#1A1A1A]/10 bg-white"
                            )}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-[#F5B731] rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-[#1A1A1A]" />
                              </div>
                            )}
                            <span className="font-[family-name:var(--font-body)] text-[#1A1A1A] font-semibold text-sm pr-6">
                              {option.name}
                            </span>
                            {option.price > 0 && (
                              <span className="font-[family-name:var(--font-body)] text-[#1A1A1A]/50 text-xs mt-0.5">
                                +{formatCurrency(option.price)}
                              </span>
                            )}
                            {option.price === 0 && (
                              <span className="font-[family-name:var(--font-body)] text-[#4CAF50] text-xs mt-0.5">
                                Included
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <SummaryView
                item={item}
                groups={groups}
                selections={selections}
                quantity={quantity}
                setQuantity={setQuantity}
                runningTotal={runningTotal}
              />
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-3 mt-4">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex-1 py-3 rounded-xl border-2 border-[#1A1A1A]/10 font-[family-name:var(--font-heading)] font-semibold text-[#1A1A1A]/70 text-sm"
              >
                Back
              </button>
            )}
            {!isSummaryStep ? (
              <button
                onClick={handleNext}
                disabled={!canAdvance}
                className={cn(
                  "flex-1 py-3 rounded-xl font-[family-name:var(--font-heading)] font-semibold text-sm transition-colors",
                  canAdvance
                    ? "bg-[#F5B731] text-[#1A1A1A]"
                    : "bg-[#1A1A1A]/10 text-[#1A1A1A]/30 cursor-not-allowed"
                )}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleAddToCart}
                className="flex-1 py-3 rounded-xl bg-[#F5B731] text-[#1A1A1A] font-[family-name:var(--font-heading)] font-bold text-sm flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                Add to Cart \u00b7 {formatCurrency(runningTotal * quantity)}
              </button>
            )}
          </div>
        </div>
      )}

      {/* No customizations - direct add to cart */}
      {steps.length === 0 && (
        <div className="px-4 mt-6">
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-10 h-10 rounded-full border-2 border-[#1A1A1A]/10 flex items-center justify-center bg-white"
            >
              <Minus className="w-4 h-4 text-[#1A1A1A]" />
            </button>
            <span className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-bold text-xl w-8 text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-10 h-10 rounded-full border-2 border-[#F5B731] flex items-center justify-center bg-[#F5B731]/10"
            >
              <Plus className="w-4 h-4 text-[#1A1A1A]" />
            </button>
          </div>
          <button
            onClick={handleAddToCart}
            className="w-full py-3.5 rounded-xl bg-[#F5B731] text-[#1A1A1A] font-[family-name:var(--font-heading)] font-bold text-base flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-5 h-5" />
            Add to Cart \u00b7 {formatCurrency(item.base_price * quantity)}
          </button>
        </div>
      )}

      {/* Running total bar (for customization steps, not summary) */}
      {steps.length > 0 && !isSummaryStep && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#1A1A1A]/10 px-4 py-3 z-30">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <div>
              <p className="font-[family-name:var(--font-body)] text-[#1A1A1A]/50 text-xs">
                Running Total
              </p>
              <p className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-bold text-lg">
                {formatCurrency(runningTotal)}
              </p>
            </div>
            <div className="font-[family-name:var(--font-body)] text-[#1A1A1A]/40 text-xs">
              Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Summary sub-component
function SummaryView({
  item,
  groups,
  selections,
  quantity,
  setQuantity,
  runningTotal,
}: {
  item: MenuItem;
  groups: GroupWithOptions[];
  selections: Selections;
  quantity: number;
  setQuantity: (q: number) => void;
  runningTotal: number;
}) {
  return (
    <div>
      <h3 className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-semibold text-base mb-3">
        Order Summary
      </h3>

      <div className="bg-white rounded-xl p-4 space-y-3">
        {/* Base price */}
        <div className="flex items-center justify-between">
          <span className="font-[family-name:var(--font-body)] text-[#1A1A1A] text-sm font-semibold">
            {item.name}
          </span>
          <span className="font-[family-name:var(--font-body)] text-[#1A1A1A]/60 text-sm">
            {formatCurrency(item.base_price)}
          </span>
        </div>

        {/* Selected customizations */}
        {groups.map((group) => {
          const selected = selections[group.id];
          if (!selected || selected.size === 0) return null;
          const selectedOptions = group.options.filter((o) =>
            selected.has(o.id)
          );
          return (
            <div key={group.id} className="border-t border-[#1A1A1A]/5 pt-2">
              <p className="font-[family-name:var(--font-body)] text-[#1A1A1A]/40 text-xs uppercase tracking-wide mb-1">
                {group.name}
              </p>
              {selectedOptions.map((opt) => (
                <div
                  key={opt.id}
                  className="flex items-center justify-between"
                >
                  <span className="font-[family-name:var(--font-body)] text-[#1A1A1A] text-sm">
                    {opt.name}
                  </span>
                  <span className="font-[family-name:var(--font-body)] text-[#1A1A1A]/60 text-xs">
                    {opt.price > 0
                      ? `+${formatCurrency(opt.price)}`
                      : "Included"}
                  </span>
                </div>
              ))}
            </div>
          );
        })}

        {/* Unit total */}
        <div className="border-t border-[#1A1A1A]/10 pt-2 flex items-center justify-between">
          <span className="font-[family-name:var(--font-body)] text-[#1A1A1A] font-bold text-sm">
            Per Item
          </span>
          <span className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-bold text-base">
            {formatCurrency(runningTotal)}
          </span>
        </div>
      </div>

      {/* Quantity selector */}
      <div className="flex items-center justify-center gap-4 mt-5">
        <button
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="w-10 h-10 rounded-full border-2 border-[#1A1A1A]/10 flex items-center justify-center bg-white"
        >
          <Minus className="w-4 h-4 text-[#1A1A1A]" />
        </button>
        <span className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-bold text-xl w-8 text-center">
          {quantity}
        </span>
        <button
          onClick={() => setQuantity(quantity + 1)}
          className="w-10 h-10 rounded-full border-2 border-[#F5B731] flex items-center justify-center bg-[#F5B731]/10"
        >
          <Plus className="w-4 h-4 text-[#1A1A1A]" />
        </button>
      </div>

      {/* Grand total */}
      {quantity > 1 && (
        <div className="mt-3 text-center">
          <span className="font-[family-name:var(--font-body)] text-[#1A1A1A]/50 text-sm">
            Total for {quantity} items:{" "}
          </span>
          <span className="font-[family-name:var(--font-heading)] text-[#1A1A1A] font-bold text-lg">
            {formatCurrency(runningTotal * quantity)}
          </span>
        </div>
      )}
    </div>
  );
}
