"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  MenuItem,
  MenuCategory,
  MenuSubcategory,
  CustomizationGroup,
  CustomizationOption,
} from "@/lib/supabase/types";
import { formatCurrency, cn, slugify } from "@/lib/utils/helpers";
import { getImageUrl } from "@/lib/utils/image";
import { Tabs, Badge, Button, Input, Modal, Spinner, ImageUpload } from "@/components/ui";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Leaf,
  Star,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  Settings2,
  Sparkles,
  GripVertical,
} from "lucide-react";

// ===================== TYPES =====================

type MenuItemForm = {
  name: string;
  description: string;
  base_price: string;
  category_id: string;
  subcategory_id: string;
  is_veg: boolean;
  is_bestseller: boolean;
  is_new: boolean;
  is_active: boolean;
  image_url: string;
  sort_order: string;
};

const EMPTY_ITEM_FORM: MenuItemForm = {
  name: "",
  description: "",
  base_price: "",
  category_id: "",
  subcategory_id: "",
  is_veg: true,
  is_bestseller: false,
  is_new: false,
  is_active: true,
  image_url: "",
  sort_order: "0",
};

type CategoryForm = {
  name: string;
  description: string;
  image_url: string;
  sort_order: string;
  is_active: boolean;
};

const EMPTY_CATEGORY_FORM: CategoryForm = {
  name: "",
  description: "",
  image_url: "",
  sort_order: "0",
  is_active: true,
};

type SubcategoryForm = {
  name: string;
  category_id: string;
  sort_order: string;
  is_active: boolean;
};

const EMPTY_SUBCATEGORY_FORM: SubcategoryForm = {
  name: "",
  category_id: "",
  sort_order: "0",
  is_active: true,
};

type GroupForm = {
  name: string;
  type: "base" | "topping" | "flavour" | "extra";
  is_required: boolean;
  min_select: string;
  max_select: string;
  sort_order: string;
};

const EMPTY_GROUP_FORM: GroupForm = {
  name: "",
  type: "base",
  is_required: true,
  min_select: "1",
  max_select: "1",
  sort_order: "0",
};

type OptionForm = {
  name: string;
  price: string;
  is_default: boolean;
  sort_order: string;
};

const EMPTY_OPTION_FORM: OptionForm = {
  name: "",
  price: "0",
  is_default: false,
  sort_order: "0",
};

// ===================== SECTION TABS =====================
const SECTION_TABS = [
  { label: "Items", value: "items" },
  { label: "Categories", value: "categories" },
];

// ===================== FILTERS =====================
type ItemFilter = {
  veg: "all" | "veg" | "nonveg";
  active: "all" | "active" | "inactive";
  bestseller: "all" | "yes" | "no";
};

export default function AdminMenuPage() {
  const [section, setSection] = useState("items");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [subcategories, setSubcategories] = useState<MenuSubcategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ItemFilter>({ veg: "all", active: "all", bestseller: "all" });
  const supabase = createClient();

  // Item modal
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState<MenuItemForm>(EMPTY_ITEM_FORM);
  const [itemSaving, setItemSaving] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<MenuItem | null>(null);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null);
  const [catForm, setCatForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
  const [catSaving, setCatSaving] = useState(false);
  const [deleteCatConfirm, setDeleteCatConfirm] = useState<MenuCategory | null>(null);

  // Subcategory modal
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<MenuSubcategory | null>(null);
  const [subForm, setSubForm] = useState<SubcategoryForm>(EMPTY_SUBCATEGORY_FORM);
  const [subSaving, setSubSaving] = useState(false);
  const [deleteSubConfirm, setDeleteSubConfirm] = useState<MenuSubcategory | null>(null);

  // Categories expand/collapse
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // Customization management
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [custGroups, setCustGroups] = useState<CustomizationGroup[]>([]);
  const [custOptions, setCustOptions] = useState<CustomizationOption[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CustomizationGroup | null>(null);
  const [groupForm, setGroupForm] = useState<GroupForm>(EMPTY_GROUP_FORM);
  const [groupSaving, setGroupSaving] = useState(false);
  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<CustomizationOption | null>(null);
  const [optionForm, setOptionForm] = useState<OptionForm>(EMPTY_OPTION_FORM);
  const [optionSaving, setOptionSaving] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<CustomizationGroup | null>(null);
  const [deleteOptionConfirm, setDeleteOptionConfirm] = useState<CustomizationOption | null>(null);

  // ===================== FETCH DATA =====================
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, subRes, itemRes] = await Promise.all([
        supabase.from("menu_categories").select("*").order("sort_order"),
        supabase.from("menu_subcategories").select("*").order("sort_order"),
        supabase.from("menu_items").select("*").order("sort_order"),
      ]);
      if (catRes.error || subRes.error || itemRes.error) throw new Error("Supabase query failed");
      setCategories((catRes.data as MenuCategory[] | null) ?? []);
      setSubcategories((subRes.data as MenuSubcategory[] | null) ?? []);
      setItems((itemRes.data as MenuItem[] | null) ?? []);
    } catch (err) {
      console.error("Failed to fetch menu data:", err);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ===================== HELPER LOOKUPS =====================
  const categoryTabs = [
    { label: "All", value: "all" },
    ...categories.map((c) => ({ label: c.name, value: c.id })),
  ];

  const getSubcategoryName = (id: string) =>
    subcategories.find((s) => s.id === id)?.name ?? "---";

  const getCategoryName = (subcategoryId: string) => {
    const sub = subcategories.find((s) => s.id === subcategoryId);
    if (!sub) return "---";
    return categories.find((c) => c.id === sub.category_id)?.name ?? "---";
  };

  const getCategoryForSubcategory = (subcategoryId: string) => {
    const sub = subcategories.find((s) => s.id === subcategoryId);
    return sub?.category_id ?? "";
  };

  const getItemCountForCategory = (catId: string) => {
    const subIds = subcategories.filter((s) => s.category_id === catId).map((s) => s.id);
    return items.filter((i) => subIds.includes(i.subcategory_id)).length;
  };

  const getItemCountForSubcategory = (subId: string) =>
    items.filter((i) => i.subcategory_id === subId).length;

  // ===================== ITEM FILTERS =====================
  const filteredSubcategoryIds =
    activeCategory === "all"
      ? subcategories.map((s) => s.id)
      : subcategories.filter((s) => s.category_id === activeCategory).map((s) => s.id);

  const filteredItems = items.filter((item) => {
    const matchesCategory = filteredSubcategoryIds.includes(item.subcategory_id);
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesVeg =
      filters.veg === "all" || (filters.veg === "veg" ? item.is_veg : !item.is_veg);
    const matchesActive =
      filters.active === "all" || (filters.active === "active" ? item.is_active : !item.is_active);
    const matchesBestseller =
      filters.bestseller === "all" || (filters.bestseller === "yes" ? item.is_bestseller : !item.is_bestseller);
    return matchesCategory && matchesSearch && matchesVeg && matchesActive && matchesBestseller;
  });

  // ===================== ITEM CRUD =====================
  const openItemAdd = () => {
    setEditingItem(null);
    setItemForm(EMPTY_ITEM_FORM);
    setItemModalOpen(true);
  };

  const openItemEdit = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description ?? "",
      base_price: String(item.base_price),
      category_id: getCategoryForSubcategory(item.subcategory_id),
      subcategory_id: item.subcategory_id,
      is_veg: item.is_veg,
      is_bestseller: item.is_bestseller,
      is_new: item.is_new,
      is_active: item.is_active,
      image_url: item.image_url ?? "",
      sort_order: String(item.sort_order),
    });
    setItemModalOpen(true);
  };

  const handleItemSave = async () => {
    if (!itemForm.name || !itemForm.base_price || !itemForm.subcategory_id) return;
    setItemSaving(true);

    const payload = {
      name: itemForm.name,
      slug: slugify(itemForm.name),
      description: itemForm.description || null,
      base_price: parseFloat(itemForm.base_price),
      subcategory_id: itemForm.subcategory_id,
      is_veg: itemForm.is_veg,
      is_bestseller: itemForm.is_bestseller,
      is_new: itemForm.is_new,
      is_active: itemForm.is_active,
      image_url: itemForm.image_url || null,
      sort_order: parseInt(itemForm.sort_order) || 0,
    };

    try {
      if (editingItem) {
        const { error } = await supabase
          .from("menu_items")
          .update(payload as never)
          .eq("id", editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_items").insert(payload as never);
        if (error) throw error;
      }
    } catch {
      console.warn("[admin/menu] Save item failed, updating local state");
      if (editingItem) {
        setItems((prev) => prev.map((i) => (i.id === editingItem.id ? { ...i, ...payload } : i)));
      } else {
        const newItem: MenuItem = {
          ...payload,
          id: `local-${Date.now()}`,
          description: payload.description,
          image_url: payload.image_url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setItems((prev) => [...prev, newItem]);
      }
    }

    setItemSaving(false);
    setItemModalOpen(false);
    fetchData();
  };

  const handleItemDelete = async (item: MenuItem) => {
    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", item.id);
      if (error) throw error;
    } catch {
      console.warn("[admin/menu] Delete item failed, updating local state");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }
    setDeleteConfirmItem(null);
    fetchData();
  };

  const toggleItemActive = async (item: MenuItem) => {
    try {
      await supabase
        .from("menu_items")
        .update({ is_active: !item.is_active } as never)
        .eq("id", item.id);
    } catch {
      // update locally
    }
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i))
    );
  };

  const toggleBestseller = async (item: MenuItem) => {
    try {
      await supabase
        .from("menu_items")
        .update({ is_bestseller: !item.is_bestseller } as never)
        .eq("id", item.id);
    } catch {
      // update locally
    }
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_bestseller: !i.is_bestseller } : i))
    );
  };

  const toggleItemNew = async (item: MenuItem) => {
    try {
      await supabase
        .from("menu_items")
        .update({ is_new: !item.is_new } as never)
        .eq("id", item.id);
    } catch {
      // update locally
    }
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_new: !i.is_new } : i))
    );
  };

  // ===================== CATEGORY CRUD =====================
  const openCatAdd = () => {
    setEditingCat(null);
    setCatForm(EMPTY_CATEGORY_FORM);
    setCatModalOpen(true);
  };

  const openCatEdit = (cat: MenuCategory) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name,
      description: cat.description ?? "",
      image_url: cat.image_url ?? "",
      sort_order: String(cat.sort_order),
      is_active: cat.is_active,
    });
    setCatModalOpen(true);
  };

  const handleCatSave = async () => {
    if (!catForm.name) return;
    setCatSaving(true);

    const payload = {
      name: catForm.name,
      slug: slugify(catForm.name),
      description: catForm.description || null,
      image_url: catForm.image_url || null,
      sort_order: parseInt(catForm.sort_order) || 0,
      is_active: catForm.is_active,
    };

    try {
      if (editingCat) {
        const { error } = await supabase
          .from("menu_categories")
          .update(payload as never)
          .eq("id", editingCat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_categories").insert(payload as never);
        if (error) throw error;
      }
    } catch {
      console.warn("[admin/menu] Save category failed, updating local state");
      if (editingCat) {
        setCategories((prev) => prev.map((c) => (c.id === editingCat.id ? { ...c, ...payload } : c)));
      } else {
        const newCat: MenuCategory = {
          ...payload,
          id: `local-${Date.now()}`,
          description: payload.description,
          image_url: payload.image_url,
          created_at: new Date().toISOString(),
        };
        setCategories((prev) => [...prev, newCat]);
      }
    }

    setCatSaving(false);
    setCatModalOpen(false);
    fetchData();
  };

  const handleCatDelete = async (cat: MenuCategory) => {
    const catItemCount = getItemCountForCategory(cat.id);
    if (catItemCount > 0) {
      alert(`Cannot delete "${cat.name}" because it has ${catItemCount} items. Remove items first.`);
      setDeleteCatConfirm(null);
      return;
    }
    try {
      // Delete subcategories first
      const subIds = subcategories.filter((s) => s.category_id === cat.id).map((s) => s.id);
      if (subIds.length > 0) {
        await supabase.from("menu_subcategories").delete().in("id", subIds as never);
      }
      const { error } = await supabase.from("menu_categories").delete().eq("id", cat.id);
      if (error) throw error;
    } catch {
      console.warn("[admin/menu] Delete category failed, updating local state");
      setSubcategories((prev) => prev.filter((s) => s.category_id !== cat.id));
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    }
    setDeleteCatConfirm(null);
    fetchData();
  };

  const toggleCatActive = async (cat: MenuCategory) => {
    try {
      await supabase
        .from("menu_categories")
        .update({ is_active: !cat.is_active } as never)
        .eq("id", cat.id);
    } catch {
      // update locally
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, is_active: !c.is_active } : c))
    );
  };

  // ===================== SUBCATEGORY CRUD =====================
  const openSubAdd = (categoryId: string) => {
    setEditingSub(null);
    setSubForm({ ...EMPTY_SUBCATEGORY_FORM, category_id: categoryId });
    setSubModalOpen(true);
  };

  const openSubEdit = (sub: MenuSubcategory) => {
    setEditingSub(sub);
    setSubForm({
      name: sub.name,
      category_id: sub.category_id,
      sort_order: String(sub.sort_order),
      is_active: sub.is_active,
    });
    setSubModalOpen(true);
  };

  const handleSubSave = async () => {
    if (!subForm.name || !subForm.category_id) return;
    setSubSaving(true);

    const payload = {
      name: subForm.name,
      slug: slugify(subForm.name),
      category_id: subForm.category_id,
      sort_order: parseInt(subForm.sort_order) || 0,
      is_active: subForm.is_active,
    };

    try {
      if (editingSub) {
        const { error } = await supabase
          .from("menu_subcategories")
          .update(payload as never)
          .eq("id", editingSub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_subcategories").insert(payload as never);
        if (error) throw error;
      }
    } catch {
      console.warn("[admin/menu] Save subcategory failed, updating local state");
      if (editingSub) {
        setSubcategories((prev) => prev.map((s) => (s.id === editingSub.id ? { ...s, ...payload } : s)));
      } else {
        const newSub: MenuSubcategory = {
          ...payload,
          id: `local-${Date.now()}`,
          created_at: new Date().toISOString(),
        };
        setSubcategories((prev) => [...prev, newSub]);
      }
    }

    setSubSaving(false);
    setSubModalOpen(false);
    fetchData();
  };

  const handleSubDelete = async (sub: MenuSubcategory) => {
    const subItemCount = getItemCountForSubcategory(sub.id);
    if (subItemCount > 0) {
      alert(`Cannot delete "${sub.name}" because it has ${subItemCount} items. Remove items first.`);
      setDeleteSubConfirm(null);
      return;
    }
    try {
      const { error } = await supabase.from("menu_subcategories").delete().eq("id", sub.id);
      if (error) throw error;
    } catch {
      console.warn("[admin/menu] Delete subcategory failed, updating local state");
      setSubcategories((prev) => prev.filter((s) => s.id !== sub.id));
    }
    setDeleteSubConfirm(null);
    fetchData();
  };

  // ===================== CUSTOMIZATION MANAGEMENT =====================
  const openCustomizations = async (item: MenuItem) => {
    setCustomizingItem(item);
    setCustLoading(true);
    try {
      const [groupsRes, optionsRes] = await Promise.all([
        supabase.from("item_customization_groups").select("*").eq("item_id", item.id).order("sort_order"),
        supabase.from("customization_options").select("*").order("sort_order"),
      ]);
      if (groupsRes.error || optionsRes.error) throw new Error("Query failed");
      setCustGroups((groupsRes.data as CustomizationGroup[] | null) ?? []);
      setCustOptions((optionsRes.data as CustomizationOption[] | null) ?? []);
    } catch (err) {
      console.error("Failed to fetch customizations:", err);
    }
    setCustLoading(false);
  };

  const closeCustomizations = () => {
    setCustomizingItem(null);
    setCustGroups([]);
    setCustOptions([]);
    setActiveGroupId(null);
  };

  // Group CRUD
  const openGroupAdd = () => {
    setEditingGroup(null);
    setGroupForm(EMPTY_GROUP_FORM);
    setGroupModalOpen(true);
  };

  const openGroupEdit = (group: CustomizationGroup) => {
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      type: group.type,
      is_required: group.is_required,
      min_select: String(group.min_select),
      max_select: String(group.max_select),
      sort_order: String(group.sort_order),
    });
    setGroupModalOpen(true);
  };

  const handleGroupSave = async () => {
    if (!groupForm.name || !customizingItem) return;
    setGroupSaving(true);

    const payload = {
      item_id: customizingItem.id,
      name: groupForm.name,
      type: groupForm.type,
      is_required: groupForm.is_required,
      min_select: parseInt(groupForm.min_select) || 0,
      max_select: parseInt(groupForm.max_select) || 1,
      sort_order: parseInt(groupForm.sort_order) || 0,
    };

    try {
      if (editingGroup) {
        const { error } = await supabase
          .from("item_customization_groups")
          .update(payload as never)
          .eq("id", editingGroup.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("item_customization_groups").insert(payload as never);
        if (error) throw error;
      }
    } catch {
      console.warn("[admin/menu] Save group failed, updating local state");
      if (editingGroup) {
        setCustGroups((prev) => prev.map((g) => (g.id === editingGroup.id ? { ...g, ...payload } : g)));
      } else {
        const newGroup: CustomizationGroup = { ...payload, id: `local-${Date.now()}` };
        setCustGroups((prev) => [...prev, newGroup]);
      }
    }

    setGroupSaving(false);
    setGroupModalOpen(false);
    if (customizingItem) openCustomizations(customizingItem);
  };

  const handleGroupDelete = async (group: CustomizationGroup) => {
    try {
      // Delete options first
      await supabase.from("customization_options").delete().eq("group_id", group.id);
      const { error } = await supabase.from("item_customization_groups").delete().eq("id", group.id);
      if (error) throw error;
    } catch {
      console.warn("[admin/menu] Delete group failed, updating local state");
      setCustOptions((prev) => prev.filter((o) => o.group_id !== group.id));
      setCustGroups((prev) => prev.filter((g) => g.id !== group.id));
    }
    setDeleteGroupConfirm(null);
    if (customizingItem) openCustomizations(customizingItem);
  };

  // Option CRUD
  const openOptionAdd = (groupId: string) => {
    setActiveGroupId(groupId);
    setEditingOption(null);
    setOptionForm(EMPTY_OPTION_FORM);
    setOptionModalOpen(true);
  };

  const openOptionEdit = (option: CustomizationOption) => {
    setActiveGroupId(option.group_id);
    setEditingOption(option);
    setOptionForm({
      name: option.name,
      price: String(option.price),
      is_default: option.is_default,
      sort_order: String(option.sort_order),
    });
    setOptionModalOpen(true);
  };

  const handleOptionSave = async () => {
    if (!optionForm.name || !activeGroupId) return;
    setOptionSaving(true);

    const payload = {
      group_id: activeGroupId,
      name: optionForm.name,
      price: parseFloat(optionForm.price) || 0,
      is_default: optionForm.is_default,
      is_active: true,
      sort_order: parseInt(optionForm.sort_order) || 0,
    };

    try {
      if (editingOption) {
        const { error } = await supabase
          .from("customization_options")
          .update(payload as never)
          .eq("id", editingOption.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customization_options").insert(payload as never);
        if (error) throw error;
      }
    } catch {
      console.warn("[admin/menu] Save option failed, updating local state");
      if (editingOption) {
        setCustOptions((prev) => prev.map((o) => (o.id === editingOption.id ? { ...o, ...payload } : o)));
      } else {
        const newOpt: CustomizationOption = { ...payload, id: `local-${Date.now()}` };
        setCustOptions((prev) => [...prev, newOpt]);
      }
    }

    setOptionSaving(false);
    setOptionModalOpen(false);
    if (customizingItem) openCustomizations(customizingItem);
  };

  const handleOptionDelete = async (option: CustomizationOption) => {
    try {
      const { error } = await supabase.from("customization_options").delete().eq("id", option.id);
      if (error) throw error;
    } catch {
      console.warn("[admin/menu] Delete option failed, updating local state");
      setCustOptions((prev) => prev.filter((o) => o.id !== option.id));
    }
    setDeleteOptionConfirm(null);
    if (customizingItem) openCustomizations(customizingItem);
  };

  // ===================== RENDER =====================
  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 px-2 pt-2">
        <Tabs tabs={SECTION_TABS} value={section} onChange={setSection} />
      </div>

      {/* ==================== ITEMS SECTION ==================== */}
      {section === "items" && (
        <div className="space-y-4">
          {/* Header with search and filters */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Input
                  placeholder="Search items..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
              <Button onClick={openItemAdd} size="sm">
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            </div>

            {/* Filters row */}
            <div className="flex flex-wrap gap-2">
              <select
                value={filters.veg}
                onChange={(e) => setFilters({ ...filters, veg: e.target.value as ItemFilter["veg"] })}
                className="rounded-lg border border-brand-gray-200 bg-white px-3 py-1.5 text-sm text-brand-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
              >
                <option value="all">All (Veg/Non-veg)</option>
                <option value="veg">Veg Only</option>
                <option value="nonveg">Non-Veg Only</option>
              </select>
              <select
                value={filters.active}
                onChange={(e) => setFilters({ ...filters, active: e.target.value as ItemFilter["active"] })}
                className="rounded-lg border border-brand-gray-200 bg-white px-3 py-1.5 text-sm text-brand-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
              <select
                value={filters.bestseller}
                onChange={(e) => setFilters({ ...filters, bestseller: e.target.value as ItemFilter["bestseller"] })}
                className="rounded-lg border border-brand-gray-200 bg-white px-3 py-1.5 text-sm text-brand-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
              >
                <option value="all">All Items</option>
                <option value="yes">Bestsellers</option>
                <option value="no">Non-Bestsellers</option>
              </select>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 px-2 pt-2">
            <Tabs tabs={categoryTabs} value={activeCategory} onChange={setActiveCategory} />
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          )}

          {/* Items List */}
          {!loading && (
            <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-gray-100 text-sm text-brand-gray-500">
                {filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""}
              </div>
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-brand-gray-400">
                  <Search className="w-10 h-10 mb-2" />
                  <p className="text-sm font-semibold">No items found</p>
                </div>
              ) : (
                <div className="divide-y divide-brand-gray-100">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-brand-gray-50 transition-colors"
                    >
                      {/* Image */}
                      <div className="w-11 h-11 rounded-lg bg-brand-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.image_url ? (
                          <img src={getImageUrl(item.image_url) ?? ""} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-brand-gray-400 text-xs">IMG</span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-brand-black truncate">{item.name}</p>
                          {item.is_veg && <Leaf className="w-3.5 h-3.5 text-brand-green shrink-0" />}
                          {!item.is_veg && (
                            <span className="w-3.5 h-3.5 rounded-sm border-2 border-red-500 flex items-center justify-center shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            </span>
                          )}
                          {item.is_bestseller && (
                            <Badge variant="warning">
                              <Star className="w-3 h-3 mr-0.5" />Best
                            </Badge>
                          )}
                          {item.is_new && <Badge variant="info">New</Badge>}
                        </div>
                        <p className="text-xs text-brand-gray-500 truncate">
                          {getCategoryName(item.subcategory_id)} &rarr; {getSubcategoryName(item.subcategory_id)}
                        </p>
                      </div>

                      {/* Price */}
                      <p className="font-bold text-brand-black shrink-0 text-sm">
                        {formatCurrency(item.base_price)}
                      </p>

                      {/* Bestseller toggle */}
                      <button
                        onClick={() => toggleBestseller(item)}
                        className={cn(
                          "shrink-0 p-1.5 rounded-lg transition-colors",
                          item.is_bestseller
                            ? "text-brand-yellow bg-brand-yellow/10"
                            : "text-brand-gray-300 hover:text-brand-gray-400"
                        )}
                        title={item.is_bestseller ? "Remove bestseller" : "Mark bestseller"}
                      >
                        <Star className="w-4 h-4" />
                      </button>

                      {/* New toggle */}
                      <button
                        onClick={() => toggleItemNew(item)}
                        className={cn(
                          "shrink-0 p-1.5 rounded-lg transition-colors",
                          item.is_new
                            ? "text-blue-500 bg-blue-50"
                            : "text-brand-gray-300 hover:text-brand-gray-400"
                        )}
                        title={item.is_new ? "Remove new tag" : "Mark as new"}
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>

                      {/* Active toggle */}
                      <button onClick={() => toggleItemActive(item)} className="shrink-0" title={item.is_active ? "Active" : "Inactive"}>
                        {item.is_active ? (
                          <ToggleRight className="w-7 h-7 text-brand-green" />
                        ) : (
                          <ToggleLeft className="w-7 h-7 text-brand-gray-300" />
                        )}
                      </button>

                      {/* Customizations */}
                      <button
                        onClick={() => openCustomizations(item)}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-brand-gray-100 transition-colors text-brand-gray-500"
                        title="Manage Customizations"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => openItemEdit(item)}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-brand-gray-100 transition-colors text-brand-gray-500"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setDeleteConfirmItem(item)}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-red-50 transition-colors text-brand-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== CATEGORIES SECTION ==================== */}
      {section === "categories" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-gray-500">
              {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
            </p>
            <Button onClick={openCatAdd} size="sm">
              <Plus className="w-4 h-4" />
              Add Category
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
              <Search className="w-10 h-10 mb-2" />
              <p className="text-sm font-semibold">No categories yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((cat) => {
                  const isExpanded = expandedCats.has(cat.id);
                  const catSubs = subcategories
                    .filter((s) => s.category_id === cat.id)
                    .sort((a, b) => a.sort_order - b.sort_order);
                  const itemCount = getItemCountForCategory(cat.id);

                  return (
                    <div
                      key={cat.id}
                      className="bg-white rounded-xl shadow-sm border border-brand-gray-100 overflow-hidden"
                    >
                      {/* Category row */}
                      <div className="flex items-center gap-3 px-5 py-4">
                        <GripVertical className="w-4 h-4 text-brand-gray-300 shrink-0" />
                        <button
                          onClick={() => {
                            const next = new Set(expandedCats);
                            if (isExpanded) next.delete(cat.id);
                            else next.add(cat.id);
                            setExpandedCats(next);
                          }}
                          className="shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-brand-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-brand-gray-500" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-brand-black">{cat.name}</p>
                          <p className="text-xs text-brand-gray-500">
                            {catSubs.length} subcategories / {itemCount} items / Sort: {cat.sort_order}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleCatActive(cat)}
                          className="shrink-0"
                          title={cat.is_active ? "Active" : "Inactive"}
                        >
                          {cat.is_active ? (
                            <ToggleRight className="w-7 h-7 text-brand-green" />
                          ) : (
                            <ToggleLeft className="w-7 h-7 text-brand-gray-300" />
                          )}
                        </button>
                        <button
                          onClick={() => openCatEdit(cat)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-brand-gray-100 text-brand-gray-500"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteCatConfirm(cat)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-red-50 text-brand-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Expanded subcategories */}
                      {isExpanded && (
                        <div className="border-t border-brand-gray-100 bg-brand-gray-50">
                          <div className="px-5 py-2 flex items-center justify-between">
                            <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wider">
                              Subcategories
                            </p>
                            <Button onClick={() => openSubAdd(cat.id)} size="sm" variant="ghost">
                              <Plus className="w-3 h-3" />
                              Add Sub
                            </Button>
                          </div>
                          {catSubs.length === 0 ? (
                            <p className="px-5 pb-4 text-sm text-brand-gray-400">No subcategories yet</p>
                          ) : (
                            <div className="divide-y divide-brand-gray-100">
                              {catSubs.map((sub) => {
                                const subItems = items.filter((i) => i.subcategory_id === sub.id);
                                return (
                                  <div
                                    key={sub.id}
                                    className="flex items-center gap-3 px-8 py-3 hover:bg-white transition-colors"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-brand-black">{sub.name}</p>
                                      <p className="text-xs text-brand-gray-500">
                                        {subItems.length} item{subItems.length !== 1 ? "s" : ""} / Sort: {sub.sort_order}
                                      </p>
                                    </div>
                                    <span
                                      className={cn(
                                        "text-xs font-semibold px-2 py-0.5 rounded-full",
                                        sub.is_active ? "bg-green-100 text-green-700" : "bg-brand-gray-100 text-brand-gray-500"
                                      )}
                                    >
                                      {sub.is_active ? "Active" : "Inactive"}
                                    </span>
                                    <button
                                      onClick={() => openSubEdit(sub)}
                                      className="shrink-0 p-1 rounded hover:bg-brand-gray-100 text-brand-gray-500"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteSubConfirm(sub)}
                                      className="shrink-0 p-1 rounded hover:bg-red-50 text-brand-gray-400 hover:text-red-500"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ==================== CUSTOMIZATION PANEL ==================== */}
      {customizingItem && (
        <Modal
          open={!!customizingItem}
          onClose={closeCustomizations}
          title={`Customizations: ${customizingItem.name}`}
          className="max-w-2xl"
        >
          {custLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <p className="text-sm text-brand-gray-500">
                  {custGroups.length} group{custGroups.length !== 1 ? "s" : ""}
                </p>
                <Button onClick={openGroupAdd} size="sm">
                  <Plus className="w-4 h-4" />
                  Add Group
                </Button>
              </div>

              {custGroups.length === 0 ? (
                <p className="text-sm text-brand-gray-400 text-center py-6">
                  No customization groups. Add one to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {custGroups.sort((a, b) => a.sort_order - b.sort_order).map((group) => {
                    const groupOpts = custOptions
                      .filter((o) => o.group_id === group.id)
                      .sort((a, b) => a.sort_order - b.sort_order);
                    return (
                      <div key={group.id} className="border border-brand-gray-200 rounded-lg overflow-hidden">
                        {/* Group header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-brand-gray-50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm text-brand-black">{group.name}</p>
                              <Badge variant="info">{group.type}</Badge>
                              {group.is_required && <Badge variant="danger">Required</Badge>}
                            </div>
                            <p className="text-xs text-brand-gray-500">
                              Select {group.min_select}-{group.max_select} / {groupOpts.length} options
                            </p>
                          </div>
                          <button
                            onClick={() => openGroupEdit(group)}
                            className="p-1.5 rounded hover:bg-brand-gray-100 text-brand-gray-500"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteGroupConfirm(group)}
                            className="p-1.5 rounded hover:bg-red-50 text-brand-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Options */}
                        <div className="divide-y divide-brand-gray-100">
                          {groupOpts.map((opt) => (
                            <div key={opt.id} className="flex items-center gap-3 px-6 py-2.5 text-sm">
                              <div className="flex-1 min-w-0">
                                <span className="text-brand-black">{opt.name}</span>
                                {opt.is_default && (
                                  <span className="ml-2 text-xs text-brand-gray-400">(default)</span>
                                )}
                              </div>
                              <span className="text-brand-gray-600 shrink-0">
                                {opt.price > 0 ? `+${formatCurrency(opt.price)}` : "Free"}
                              </span>
                              <button
                                onClick={() => openOptionEdit(opt)}
                                className="p-1 rounded hover:bg-brand-gray-100 text-brand-gray-400"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setDeleteOptionConfirm(opt)}
                                className="p-1 rounded hover:bg-red-50 text-brand-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <div className="px-6 py-2">
                            <button
                              onClick={() => openOptionAdd(group.id)}
                              className="text-xs font-semibold text-brand-yellow-dark hover:text-brand-yellow transition-colors flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              Add Option
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* ==================== MODALS ==================== */}

      {/* Add/Edit Item Modal */}
      <Modal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={editingItem ? "Edit Item" : "Add Item"}
        className="max-w-lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <Input
            label="Name"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="e.g. Sprouted Moong Bowl"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-brand-gray-700">Slug</label>
            <p className="text-sm text-brand-gray-500 bg-brand-gray-50 rounded-lg px-3 py-2">
              {itemForm.name ? slugify(itemForm.name) : "(auto-generated from name)"}
            </p>
          </div>
          <Input
            label="Description"
            value={itemForm.description}
            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            placeholder="Short description"
          />

          {/* Category -> Subcategory cascading */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-brand-gray-700">Category</label>
              <select
                value={itemForm.category_id}
                onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value, subcategory_id: "" })}
                className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-brand-gray-700">Subcategory</label>
              <select
                value={itemForm.subcategory_id}
                onChange={(e) => setItemForm({ ...itemForm, subcategory_id: e.target.value })}
                className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
                disabled={!itemForm.category_id}
              >
                <option value="">Select subcategory</option>
                {subcategories
                  .filter((s) => s.category_id === itemForm.category_id)
                  .map((sc) => (
                    <option key={sc.id} value={sc.id}>{sc.name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Base Price"
              type="number"
              value={itemForm.base_price}
              onChange={(e) => setItemForm({ ...itemForm, base_price: e.target.value })}
              placeholder="99"
            />
            <Input
              label="Sort Order"
              type="number"
              value={itemForm.sort_order}
              onChange={(e) => setItemForm({ ...itemForm, sort_order: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Item Image</label>
            <ImageUpload
              value={itemForm.image_url || null}
              onChange={(url) => setItemForm({ ...itemForm, image_url: url ?? "" })}
              folder="menu"
              aspect="square"
              placeholder="Upload item photo"
            />
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["is_veg", "Vegetarian"],
                ["is_bestseller", "Bestseller"],
                ["is_new", "New Item"],
                ["is_active", "Active"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemForm[key]}
                  onChange={(e) => setItemForm({ ...itemForm, [key]: e.target.checked })}
                  className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow"
                />
                <span className="text-sm font-medium text-brand-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setItemModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={itemSaving} onClick={handleItemSave}>
            {editingItem ? "Update" : "Add Item"}
          </Button>
        </div>
      </Modal>

      {/* Add/Edit Category Modal */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={editingCat ? "Edit Category" : "Add Category"}
        className="max-w-lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <Input
            label="Name"
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            placeholder="e.g. Sprout Bowls"
          />
          <Input
            label="Description"
            value={catForm.description}
            onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
            placeholder="Category description"
          />
          <div>
            <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Category Image</label>
            <ImageUpload
              value={catForm.image_url || null}
              onChange={(url) => setCatForm({ ...catForm, image_url: url ?? "" })}
              folder="categories"
              aspect="landscape"
              placeholder="Upload category image"
            />
          </div>
          <Input
            label="Sort Order"
            type="number"
            value={catForm.sort_order}
            onChange={(e) => setCatForm({ ...catForm, sort_order: e.target.value })}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={catForm.is_active}
              onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow"
            />
            <span className="text-sm font-medium text-brand-gray-700">Active</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setCatModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={catSaving} onClick={handleCatSave}>
            {editingCat ? "Update" : "Add Category"}
          </Button>
        </div>
      </Modal>

      {/* Add/Edit Subcategory Modal */}
      <Modal
        open={subModalOpen}
        onClose={() => setSubModalOpen(false)}
        title={editingSub ? "Edit Subcategory" : "Add Subcategory"}
        className="max-w-md"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={subForm.name}
            onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
            placeholder="e.g. Classic Bowls"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-brand-gray-700">Category</label>
            <select
              value={subForm.category_id}
              onChange={(e) => setSubForm({ ...subForm, category_id: e.target.value })}
              className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <Input
            label="Sort Order"
            type="number"
            value={subForm.sort_order}
            onChange={(e) => setSubForm({ ...subForm, sort_order: e.target.value })}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={subForm.is_active}
              onChange={(e) => setSubForm({ ...subForm, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow"
            />
            <span className="text-sm font-medium text-brand-gray-700">Active</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setSubModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={subSaving} onClick={handleSubSave}>
            {editingSub ? "Update" : "Add Subcategory"}
          </Button>
        </div>
      </Modal>

      {/* Add/Edit Group Modal */}
      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title={editingGroup ? "Edit Customization Group" : "Add Customization Group"}
        className="max-w-md"
      >
        <div className="space-y-4">
          <Input
            label="Group Name"
            value={groupForm.name}
            onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
            placeholder="e.g. Choose Base"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-brand-gray-700">Type</label>
            <select
              value={groupForm.type}
              onChange={(e) => setGroupForm({ ...groupForm, type: e.target.value as GroupForm["type"] })}
              className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
            >
              <option value="base">Base</option>
              <option value="topping">Topping</option>
              <option value="flavour">Flavour</option>
              <option value="extra">Extra</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min Select"
              type="number"
              value={groupForm.min_select}
              onChange={(e) => setGroupForm({ ...groupForm, min_select: e.target.value })}
            />
            <Input
              label="Max Select"
              type="number"
              value={groupForm.max_select}
              onChange={(e) => setGroupForm({ ...groupForm, max_select: e.target.value })}
            />
          </div>
          <Input
            label="Sort Order"
            type="number"
            value={groupForm.sort_order}
            onChange={(e) => setGroupForm({ ...groupForm, sort_order: e.target.value })}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={groupForm.is_required}
              onChange={(e) => setGroupForm({ ...groupForm, is_required: e.target.checked })}
              className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow"
            />
            <span className="text-sm font-medium text-brand-gray-700">Required</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setGroupModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={groupSaving} onClick={handleGroupSave}>
            {editingGroup ? "Update" : "Add Group"}
          </Button>
        </div>
      </Modal>

      {/* Add/Edit Option Modal */}
      <Modal
        open={optionModalOpen}
        onClose={() => setOptionModalOpen(false)}
        title={editingOption ? "Edit Option" : "Add Option"}
        className="max-w-md"
      >
        <div className="space-y-4">
          <Input
            label="Option Name"
            value={optionForm.name}
            onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })}
            placeholder="e.g. Moong Sprouts"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Extra Price"
              type="number"
              value={optionForm.price}
              onChange={(e) => setOptionForm({ ...optionForm, price: e.target.value })}
              placeholder="0"
            />
            <Input
              label="Sort Order"
              type="number"
              value={optionForm.sort_order}
              onChange={(e) => setOptionForm({ ...optionForm, sort_order: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={optionForm.is_default}
              onChange={(e) => setOptionForm({ ...optionForm, is_default: e.target.checked })}
              className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow"
            />
            <span className="text-sm font-medium text-brand-gray-700">Default selection</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setOptionModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={optionSaving} onClick={handleOptionSave}>
            {editingOption ? "Update" : "Add Option"}
          </Button>
        </div>
      </Modal>

      {/* ==================== DELETE CONFIRMATIONS ==================== */}

      {/* Delete Item Confirm */}
      <Modal
        open={!!deleteConfirmItem}
        onClose={() => setDeleteConfirmItem(null)}
        title="Delete Item"
        className="max-w-sm"
      >
        <p className="text-sm text-brand-gray-600">
          Are you sure you want to delete <strong>{deleteConfirmItem?.name}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmItem(null)}>Cancel</Button>
          <Button
            size="sm"
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={() => deleteConfirmItem && handleItemDelete(deleteConfirmItem)}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Delete Category Confirm */}
      <Modal
        open={!!deleteCatConfirm}
        onClose={() => setDeleteCatConfirm(null)}
        title="Delete Category"
        className="max-w-sm"
      >
        <p className="text-sm text-brand-gray-600">
          Are you sure you want to delete <strong>{deleteCatConfirm?.name}</strong>?
          {deleteCatConfirm && getItemCountForCategory(deleteCatConfirm.id) > 0
            ? " This category has items and cannot be deleted."
            : " This will also remove all subcategories."}
        </p>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setDeleteCatConfirm(null)}>Cancel</Button>
          <Button
            size="sm"
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={() => deleteCatConfirm && handleCatDelete(deleteCatConfirm)}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Delete Subcategory Confirm */}
      <Modal
        open={!!deleteSubConfirm}
        onClose={() => setDeleteSubConfirm(null)}
        title="Delete Subcategory"
        className="max-w-sm"
      >
        <p className="text-sm text-brand-gray-600">
          Are you sure you want to delete <strong>{deleteSubConfirm?.name}</strong>?
        </p>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setDeleteSubConfirm(null)}>Cancel</Button>
          <Button
            size="sm"
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={() => deleteSubConfirm && handleSubDelete(deleteSubConfirm)}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Delete Group Confirm */}
      <Modal
        open={!!deleteGroupConfirm}
        onClose={() => setDeleteGroupConfirm(null)}
        title="Delete Customization Group"
        className="max-w-sm"
      >
        <p className="text-sm text-brand-gray-600">
          Are you sure you want to delete <strong>{deleteGroupConfirm?.name}</strong>? All options in this group will also be deleted.
        </p>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setDeleteGroupConfirm(null)}>Cancel</Button>
          <Button
            size="sm"
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={() => deleteGroupConfirm && handleGroupDelete(deleteGroupConfirm)}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Delete Option Confirm */}
      <Modal
        open={!!deleteOptionConfirm}
        onClose={() => setDeleteOptionConfirm(null)}
        title="Delete Option"
        className="max-w-sm"
      >
        <p className="text-sm text-brand-gray-600">
          Are you sure you want to delete <strong>{deleteOptionConfirm?.name}</strong>?
        </p>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setDeleteOptionConfirm(null)}>Cancel</Button>
          <Button
            size="sm"
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={() => deleteOptionConfirm && handleOptionDelete(deleteOptionConfirm)}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
