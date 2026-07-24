"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Modal, Spinner, Tabs, Badge } from "@/components/ui";
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  ArrowUpCircle,
  ArrowDownCircle,
  History,
  AlertTriangle,
  ChefHat,
  Search,
  Filter,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils/helpers";

type Outlet = { id: string; name: string };

type InventoryItem = {
  id: string;
  outlet_id: string;
  name: string;
  unit: string;
  quantity: number;
  min_stock_level: number;
  cost_per_unit: number | null;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type RecipeIngredient = {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity_required: number;
  menu_item_name?: string;
  inventory_item_name?: string;
  inventory_item_unit?: string;
};

type InventoryLog = {
  id: string;
  inventory_item_id: string;
  change_type: string;
  quantity_change: number;
  quantity_after: number;
  reference_id: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  item_name?: string;
  performer_name?: string;
};

type MenuItem = { id: string; name: string; subcategory_id: string };

type InventoryForm = {
  name: string;
  unit: string;
  quantity: string;
  min_stock_level: string;
  cost_per_unit: string;
  category: string;
};

const EMPTY_FORM: InventoryForm = {
  name: "",
  unit: "kg",
  quantity: "0",
  min_stock_level: "0",
  cost_per_unit: "",
  category: "general",
};

const UNITS = [
  { value: "kg", label: "Kilograms (kg)" },
  { value: "g", label: "Grams (g)" },
  { value: "ml", label: "Milliliters (ml)" },
  { value: "l", label: "Liters (l)" },
  { value: "pcs", label: "Pieces (pcs)" },
  { value: "dozen", label: "Dozen" },
  { value: "packets", label: "Packets" },
];

const CATEGORIES = [
  "general",
  "vegetables",
  "fruits",
  "dairy",
  "grains",
  "spices",
  "oils",
  "proteins",
  "sauces",
  "packaging",
  "beverages",
];

const TABS = [
  { label: "Raw Materials", value: "materials" },
  { label: "Recipes", value: "recipes" },
  { label: "Stock Update", value: "stock" },
  { label: "Activity Log", value: "log" },
];

export default function AdminInventoryPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const outletParam = searchParams.get("outlet");
  const [activeTab, setActiveTab] = useState("materials");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<string>(outletParam ?? "");
  const [loading, setLoading] = useState(true);

  // Materials state
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<InventoryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // Recipe state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeIngredient[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeForm, setRecipeForm] = useState({ menu_item_id: "", inventory_item_id: "", quantity_required: "" });
  const [recipeSaving, setRecipeSaving] = useState(false);

  // Stock update state
  const [stockItem, setStockItem] = useState<string>("");
  const [stockChangeType, setStockChangeType] = useState<string>("addition");
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockNotes, setStockNotes] = useState("");
  const [stockSaving, setStockSaving] = useState(false);

  // Recipe deduction state
  const [deductMenuItem, setDeductMenuItem] = useState("");
  const [deductQuantity, setDeductQuantity] = useState("1");
  const [deductSaving, setDeductSaving] = useState(false);

  // Log state
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchOutlets = useCallback(async () => {
    const { data } = await supabase
      .from("outlets")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (data) {
      setOutlets(data as Outlet[]);
      if (data.length > 0 && !selectedOutlet) {
        setSelectedOutlet(outletParam && data.some((o) => o.id === outletParam) ? outletParam : data[0].id);
      }
    }
    setLoading(false);
  }, [supabase, selectedOutlet, outletParam]);

  useEffect(() => { fetchOutlets(); }, [fetchOutlets]);

  const fetchItems = useCallback(async () => {
    if (!selectedOutlet) return;
    setItemsLoading(true);
    const { data, error } = await supabase
      .from("inventory_items" as never)
      .select("*")
      .eq("outlet_id" as never, selectedOutlet as never)
      .order("category" as never)
      .order("name" as never);
    if (error) {
      toast.error("Failed to load inventory");
    } else {
      setItems((data as InventoryItem[] | null) ?? []);
    }
    setItemsLoading(false);
  }, [supabase, selectedOutlet]);

  const fetchRecipes = useCallback(async () => {
    if (!selectedOutlet) return;
    setRecipesLoading(true);
    const { data: recipeData, error } = await supabase
      .from("recipe_ingredients" as never)
      .select("*, inventory_items:inventory_item_id(name, unit, outlet_id), menu_items:menu_item_id(name)" as never)
      .eq("inventory_items.outlet_id" as never, selectedOutlet as never);

    if (error) {
      toast.error("Failed to load recipes");
      setRecipesLoading(false);
      return;
    }

    const mapped = ((recipeData as never[]) ?? []).map((r: never) => {
      const row = r as Record<string, unknown>;
      const inv = row.inventory_items as Record<string, unknown> | null;
      const mi = row.menu_items as Record<string, unknown> | null;
      return {
        id: row.id as string,
        menu_item_id: row.menu_item_id as string,
        inventory_item_id: row.inventory_item_id as string,
        quantity_required: row.quantity_required as number,
        menu_item_name: mi?.name as string | undefined,
        inventory_item_name: inv?.name as string | undefined,
        inventory_item_unit: inv?.unit as string | undefined,
      };
    }).filter((r) => r.inventory_item_name);

    setRecipes(mapped);
    setRecipesLoading(false);
  }, [supabase, selectedOutlet]);

  const fetchMenuItems = useCallback(async () => {
    const { data } = await supabase
      .from("menu_items")
      .select("id, name, subcategory_id")
      .eq("is_active", true)
      .order("name");
    if (data) setMenuItems(data as MenuItem[]);
  }, [supabase]);

  const fetchLogs = useCallback(async () => {
    if (!selectedOutlet) return;
    setLogsLoading(true);
    const { data: logData, error } = await supabase
      .from("inventory_logs" as never)
      .select("*, inventory_items:inventory_item_id(name, outlet_id), profiles:performed_by(full_name)" as never)
      .eq("inventory_items.outlet_id" as never, selectedOutlet as never)
      .order("created_at" as never, { ascending: false })
      .limit(100);

    if (error) {
      toast.error("Failed to load activity log");
      setLogsLoading(false);
      return;
    }

    const mapped = ((logData as never[]) ?? []).map((l: never) => {
      const row = l as Record<string, unknown>;
      const inv = row.inventory_items as Record<string, unknown> | null;
      const prof = row.profiles as Record<string, unknown> | null;
      return {
        id: row.id as string,
        inventory_item_id: row.inventory_item_id as string,
        change_type: row.change_type as string,
        quantity_change: row.quantity_change as number,
        quantity_after: row.quantity_after as number,
        reference_id: row.reference_id as string | null,
        notes: row.notes as string | null,
        performed_by: row.performed_by as string | null,
        created_at: row.created_at as string,
        item_name: inv?.name as string | undefined,
        performer_name: prof?.full_name as string | undefined,
      };
    }).filter((l) => l.item_name);

    setLogs(mapped);
    setLogsLoading(false);
  }, [supabase, selectedOutlet]);

  useEffect(() => {
    if (!selectedOutlet) return;
    fetchItems();
    fetchMenuItems();
  }, [selectedOutlet, fetchItems, fetchMenuItems]);

  useEffect(() => {
    if (!selectedOutlet) return;
    if (activeTab === "recipes") fetchRecipes();
    if (activeTab === "log") fetchLogs();
  }, [selectedOutlet, activeTab, fetchRecipes, fetchLogs]);

  // --- Materials CRUD ---
  const openAddItem = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      unit: item.unit,
      quantity: String(item.quantity),
      min_stock_level: String(item.min_stock_level),
      cost_per_unit: item.cost_per_unit ? String(item.cost_per_unit) : "",
      category: item.category,
    });
    setModalOpen(true);
  };

  const handleSaveItem = async () => {
    if (!form.name || !selectedOutlet) return;
    setSaving(true);

    const payload = {
      outlet_id: selectedOutlet,
      name: form.name.trim(),
      unit: form.unit,
      quantity: parseFloat(form.quantity) || 0,
      min_stock_level: parseFloat(form.min_stock_level) || 0,
      cost_per_unit: form.cost_per_unit ? parseFloat(form.cost_per_unit) : null,
      category: form.category,
      is_active: true,
    };

    if (editingItem) {
      const { error } = await supabase
        .from("inventory_items" as never)
        .update(payload as never)
        .eq("id" as never, editingItem.id as never);
      if (error) {
        const msg = error.message || "Save failed";
        if (msg.includes("idx_inventory_items_outlet_name")) {
          toast.error("An item with this name already exists in this outlet");
        } else {
          toast.error(msg);
        }
        setSaving(false);
        return;
      }
      toast.success("Item updated");
    } else {
      const { error } = await supabase
        .from("inventory_items" as never)
        .insert(payload as never);
      if (error) {
        const msg = error.message || "Save failed";
        if (msg.includes("idx_inventory_items_outlet_name")) {
          toast.error("An item with this name already exists in this outlet");
        } else {
          toast.error(msg);
        }
        setSaving(false);
        return;
      }
      toast.success("Item added");
    }

    setSaving(false);
    setModalOpen(false);
    fetchItems();
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    try {
      const { error } = await supabase
        .from("inventory_items" as never)
        .delete()
        .eq("id" as never, item.id as never);
      if (error) throw error;
      toast.success("Item deleted");
    } catch {
      toast.error("Could not delete item");
    }
    setDeleteConfirm(null);
    fetchItems();
  };

  // --- Recipe CRUD ---
  const handleAddRecipe = async () => {
    if (!recipeForm.menu_item_id || !recipeForm.inventory_item_id || !recipeForm.quantity_required) return;
    setRecipeSaving(true);

    try {
      const { error } = await supabase
        .from("recipe_ingredients" as never)
        .insert({
          menu_item_id: recipeForm.menu_item_id,
          inventory_item_id: recipeForm.inventory_item_id,
          quantity_required: parseFloat(recipeForm.quantity_required),
        } as never);
      if (error) throw error;
      toast.success("Recipe ingredient added");
      setRecipeForm({ menu_item_id: "", inventory_item_id: "", quantity_required: "" });
      setRecipeModalOpen(false);
      fetchRecipes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add recipe ingredient";
      if (msg.includes("unique")) {
        toast.error("This ingredient is already linked to this menu item");
      } else {
        toast.error(msg);
      }
    }
    setRecipeSaving(false);
  };

  const handleDeleteRecipe = async (id: string) => {
    try {
      const { error } = await supabase
        .from("recipe_ingredients" as never)
        .delete()
        .eq("id" as never, id as never);
      if (error) throw error;
      toast.success("Recipe ingredient removed");
      fetchRecipes();
    } catch {
      toast.error("Could not remove ingredient");
    }
  };

  // --- Low Stock Email Alert ---
  const sendLowStockEmail = async (item: InventoryItem, newQuantity: number) => {
    if (newQuantity > item.min_stock_level || item.min_stock_level <= 0) return;
    const outlet = outlets.find((o) => o.id === selectedOutlet);
    try {
      await fetch("/api/admin/inventory-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: item.id,
          item_name: item.name,
          quantity: newQuantity,
          min_stock_level: item.min_stock_level,
          unit: item.unit,
          outlet_name: outlet?.name || "Unknown",
          outlet_id: selectedOutlet,
        }),
      });
    } catch {
      // Email alert is non-blocking
    }
  };

  // --- Stock Update ---
  const handleStockUpdate = async () => {
    if (!stockItem || !stockQuantity) return;
    setStockSaving(true);

    const qty = parseFloat(stockQuantity);
    if (qty <= 0) {
      toast.error("Quantity must be greater than 0");
      setStockSaving(false);
      return;
    }

    const item = items.find((i) => i.id === stockItem);
    if (!item) {
      setStockSaving(false);
      return;
    }

    const isAddition = stockChangeType === "addition";
    const newQuantity = isAddition ? item.quantity + qty : Math.max(0, item.quantity - qty);
    const quantityChange = isAddition ? qty : -qty;

    try {
      const { error: updateError } = await supabase
        .from("inventory_items" as never)
        .update({ quantity: newQuantity } as never)
        .eq("id" as never, item.id as never);
      if (updateError) throw updateError;

      const { error: logError } = await supabase
        .from("inventory_logs" as never)
        .insert({
          inventory_item_id: item.id,
          change_type: stockChangeType,
          quantity_change: quantityChange,
          quantity_after: newQuantity,
          notes: stockNotes || null,
        } as never);
      if (logError) throw logError;

      toast.success(`Stock ${isAddition ? "added" : "deducted"} successfully`);
      sendLowStockEmail(item, newQuantity);
      setStockItem("");
      setStockQuantity("");
      setStockNotes("");
      fetchItems();
    } catch {
      toast.error("Stock update failed");
    }
    setStockSaving(false);
  };

  // --- Recipe Deduction ---
  const handleRecipeDeduction = async () => {
    if (!deductMenuItem || !deductQuantity || !selectedOutlet) return;
    setDeductSaving(true);

    const qty = parseInt(deductQuantity);
    if (qty <= 0) {
      toast.error("Quantity must be at least 1");
      setDeductSaving(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc("deduct_inventory_for_recipe" as never, {
        p_menu_item_id: deductMenuItem,
        p_outlet_id: selectedOutlet,
        p_quantity: qty,
      } as never);
      if (error) throw error;

      const results = data as unknown[];
      if (!results || (results as unknown[]).length === 0) {
        toast.error("No recipe ingredients found for this item in this outlet");
      } else {
        toast.success(`Inventory deducted for ${qty} unit(s)`);
        setDeductMenuItem("");
        setDeductQuantity("1");
        // Re-fetch and check for low stock items after deduction
        const { data: updatedItems } = await supabase
          .from("inventory_items" as never)
          .select("*")
          .eq("outlet_id" as never, selectedOutlet as never);
        if (updatedItems) {
          const updated = updatedItems as InventoryItem[];
          updated.forEach((ui) => {
            if (ui.quantity <= ui.min_stock_level && ui.min_stock_level > 0) {
              const prev = items.find((old) => old.id === ui.id);
              if (prev && prev.quantity > prev.min_stock_level) {
                sendLowStockEmail(ui, ui.quantity);
              }
            }
          });
        }
        fetchItems();
      }
    } catch {
      toast.error("Recipe deduction failed");
    }
    setDeductSaving(false);
  };

  // --- Filtered Items ---
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockItems = items.filter((i) => i.quantity <= i.min_stock_level && i.is_active);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Outlet Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-brand-yellow-dark" />
          <label className="text-sm font-semibold text-brand-gray-700">Outlet:</label>
          <select
            value={selectedOutlet}
            onChange={(e) => setSelectedOutlet(e.target.value)}
            className="text-sm border border-brand-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {lowStockItems.length > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-xs font-semibold text-red-700">
              {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} below minimum stock
            </span>
            <button
              onClick={async () => {
                const outlet = outlets.find((o) => o.id === selectedOutlet);
                for (const item of lowStockItems) {
                  await fetch("/api/admin/inventory-alerts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      inventory_item_id: item.id,
                      item_name: item.name,
                      quantity: item.quantity,
                      min_stock_level: item.min_stock_level,
                      unit: item.unit,
                      outlet_name: outlet?.name || "Unknown",
                      outlet_id: selectedOutlet,
                    }),
                  });
                }
                toast.success("Low stock alert emails sent");
              }}
              className="ml-auto text-xs font-medium text-red-600 hover:text-red-800 underline underline-offset-2 whitespace-nowrap"
            >
              Notify via Email
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

      {/* Raw Materials Tab */}
      {activeTab === "materials" && (
        <div className="space-y-4">
          {/* Search + Filter + Add */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-gray-400" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-brand-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-brand-gray-400" />
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="text-sm border border-brand-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <Button onClick={openAddItem} size="sm">
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </div>

          {itemsLoading ? (
            <div className="flex justify-center py-10"><Spinner size="lg" /></div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-brand-gray-400">
              <Package className="w-12 h-12 mb-3" />
              <p className="text-base font-semibold">No inventory items</p>
              <p className="text-sm mt-1">Add raw materials to track stock for this outlet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-gray-100 text-left">
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Name</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Category</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600 text-right">Stock</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600 text-right">Min Level</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600 text-right">Cost/Unit</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Status</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-50">
                  {filteredItems.map((item) => {
                    const isLow = item.quantity <= item.min_stock_level;
                    return (
                      <tr key={item.id} className="hover:bg-brand-gray-50/50">
                        <td className="py-3 px-3 font-medium text-brand-black">{item.name}</td>
                        <td className="py-3 px-3">
                          <span className="text-xs bg-brand-gray-100 text-brand-gray-600 px-2 py-0.5 rounded-full capitalize">
                            {item.category}
                          </span>
                        </td>
                        <td className={cn("py-3 px-3 text-right font-semibold", isLow ? "text-red-600" : "text-brand-black")}>
                          {Number(item.quantity).toFixed(item.unit === "pcs" || item.unit === "dozen" || item.unit === "packets" ? 0 : 2)} {item.unit}
                        </td>
                        <td className="py-3 px-3 text-right text-brand-gray-500">
                          {Number(item.min_stock_level).toFixed(item.unit === "pcs" || item.unit === "dozen" || item.unit === "packets" ? 0 : 2)} {item.unit}
                        </td>
                        <td className="py-3 px-3 text-right text-brand-gray-500">
                          {item.cost_per_unit ? `₹${Number(item.cost_per_unit).toFixed(2)}` : "-"}
                        </td>
                        <td className="py-3 px-3">
                          {isLow ? (
                            <Badge variant="danger">Low Stock</Badge>
                          ) : (
                            <Badge variant="success">In Stock</Badge>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditItem(item)}
                              className="p-1.5 rounded-lg hover:bg-brand-gray-100 text-brand-gray-500 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(item)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-brand-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Recipes Tab */}
      {activeTab === "recipes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-gray-500">
              Link menu items to raw materials so inventory updates automatically during recipe usage.
            </p>
            <Button onClick={() => setRecipeModalOpen(true)} size="sm">
              <Plus className="w-4 h-4" />
              Add Ingredient
            </Button>
          </div>

          {recipesLoading ? (
            <div className="flex justify-center py-10"><Spinner size="lg" /></div>
          ) : recipes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-brand-gray-400">
              <ChefHat className="w-12 h-12 mb-3" />
              <p className="text-base font-semibold">No recipes configured</p>
              <p className="text-sm mt-1">Link menu items to inventory for automatic deductions</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-gray-100 text-left">
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Menu Item</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Raw Material</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600 text-right">Qty Required</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-50">
                  {recipes.map((recipe) => (
                    <tr key={recipe.id} className="hover:bg-brand-gray-50/50">
                      <td className="py-3 px-3 font-medium text-brand-black">{recipe.menu_item_name}</td>
                      <td className="py-3 px-3 text-brand-gray-700">{recipe.inventory_item_name}</td>
                      <td className="py-3 px-3 text-right text-brand-gray-700">
                        {recipe.quantity_required} {recipe.inventory_item_unit}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleDeleteRecipe(recipe.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-brand-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stock Update Tab */}
      {activeTab === "stock" && (
        <div className="space-y-6">
          {/* Manual Stock Update */}
          <div className="bg-white rounded-xl border border-brand-gray-100 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpCircle className="w-5 h-5 text-brand-green" />
              <h3 className="font-semibold text-brand-black font-[family-name:var(--font-heading)]">Manual Stock Update</h3>
            </div>
            <p className="text-sm text-brand-gray-500">
              Add or deduct stock manually (e.g., new deliveries, wastage, adjustments).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Item</label>
                <select
                  value={stockItem}
                  onChange={(e) => setStockItem(e.target.value)}
                  className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
                >
                  <option value="">Select item...</option>
                  {items.filter((i) => i.is_active).map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Type</label>
                <select
                  value={stockChangeType}
                  onChange={(e) => setStockChangeType(e.target.value)}
                  className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
                >
                  <option value="addition">Addition (Restock)</option>
                  <option value="deduction">Deduction (Manual)</option>
                  <option value="wastage">Wastage</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Quantity</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Notes (optional)</label>
                <input
                  type="text"
                  value={stockNotes}
                  onChange={(e) => setStockNotes(e.target.value)}
                  placeholder="e.g. Weekly delivery, spoilage"
                  className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
                />
              </div>
            </div>

            <Button onClick={handleStockUpdate} loading={stockSaving} disabled={!stockItem || !stockQuantity}>
              {stockChangeType === "addition" ? (
                <><ArrowUpCircle className="w-4 h-4" /> Add Stock</>
              ) : (
                <><ArrowDownCircle className="w-4 h-4" /> Deduct Stock</>
              )}
            </Button>
          </div>

          {/* Recipe-based Deduction */}
          <div className="bg-white rounded-xl border border-brand-gray-100 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ChefHat className="w-5 h-5 text-brand-yellow-dark" />
              <h3 className="font-semibold text-brand-black font-[family-name:var(--font-heading)]">Recipe Deduction</h3>
            </div>
            <p className="text-sm text-brand-gray-500">
              Deduct inventory based on a menu item&apos;s recipe. All linked raw materials will be reduced by the required quantities.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Menu Item</label>
                <select
                  value={deductMenuItem}
                  onChange={(e) => setDeductMenuItem(e.target.value)}
                  className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
                >
                  <option value="">Select menu item...</option>
                  {menuItems.map((mi) => (
                    <option key={mi.id} value={mi.id}>{mi.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Quantity (servings)</label>
                <input
                  type="number"
                  min="1"
                  value={deductQuantity}
                  onChange={(e) => setDeductQuantity(e.target.value)}
                  className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
                />
              </div>
            </div>

            <Button onClick={handleRecipeDeduction} loading={deductSaving} disabled={!deductMenuItem}>
              <ChefHat className="w-4 h-4" />
              Deduct Inventory
            </Button>
          </div>
        </div>
      )}

      {/* Activity Log Tab */}
      {activeTab === "log" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-brand-gray-500" />
            <p className="text-sm text-brand-gray-500">Recent inventory changes for this outlet (last 100 entries).</p>
          </div>

          {logsLoading ? (
            <div className="flex justify-center py-10"><Spinner size="lg" /></div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-brand-gray-400">
              <History className="w-12 h-12 mb-3" />
              <p className="text-base font-semibold">No activity yet</p>
              <p className="text-sm mt-1">Stock changes will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-gray-100 text-left">
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Time</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Item</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Type</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600 text-right">Change</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600 text-right">After</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">Notes</th>
                    <th className="py-3 px-3 font-semibold text-brand-gray-600">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-brand-gray-50/50">
                      <td className="py-3 px-3 text-brand-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="py-3 px-3 font-medium text-brand-black">{log.item_name}</td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-semibold capitalize",
                          log.change_type === "addition" ? "bg-green-100 text-green-700" :
                          log.change_type === "recipe_usage" ? "bg-blue-100 text-blue-700" :
                          log.change_type === "wastage" ? "bg-orange-100 text-orange-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {log.change_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className={cn("py-3 px-3 text-right font-semibold", log.quantity_change > 0 ? "text-green-600" : "text-red-600")}>
                        {log.quantity_change > 0 ? "+" : ""}{Number(log.quantity_change).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right text-brand-gray-600">{Number(log.quantity_after).toFixed(2)}</td>
                      <td className="py-3 px-3 text-brand-gray-500 max-w-[150px] truncate">{log.notes ?? "-"}</td>
                      <td className="py-3 px-3 text-brand-gray-500">{log.performer_name ?? "System"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Item Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingItem ? "Edit Inventory Item" : "Add Inventory Item"}
        className="max-w-lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Peanut Butter, Oats, Almond Milk"
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Unit</label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Current Quantity"
              type="number"
              step="any"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <Input
              label="Minimum Stock Level"
              type="number"
              step="any"
              min="0"
              value={form.min_stock_level}
              onChange={(e) => setForm({ ...form, min_stock_level: e.target.value })}
            />
          </div>
          <Input
            label="Cost per Unit (optional)"
            type="number"
            step="0.01"
            min="0"
            value={form.cost_per_unit}
            onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })}
            placeholder="₹ per unit"
          />
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSaveItem}>
            {editingItem ? "Update" : "Add Item"}
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Item"
        className="max-w-sm"
      >
        <p className="text-sm text-brand-gray-600">
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? All recipe links and logs for this item will also be removed.
        </p>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            size="sm"
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={() => deleteConfirm && handleDeleteItem(deleteConfirm)}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Add Recipe Modal */}
      <Modal
        open={recipeModalOpen}
        onClose={() => setRecipeModalOpen(false)}
        title="Add Recipe Ingredient"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Menu Item</label>
            <select
              value={recipeForm.menu_item_id}
              onChange={(e) => setRecipeForm({ ...recipeForm, menu_item_id: e.target.value })}
              className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
            >
              <option value="">Select menu item...</option>
              {menuItems.map((mi) => (
                <option key={mi.id} value={mi.id}>{mi.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Raw Material</label>
            <select
              value={recipeForm.inventory_item_id}
              onChange={(e) => setRecipeForm({ ...recipeForm, inventory_item_id: e.target.value })}
              className="w-full text-sm border border-brand-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
            >
              <option value="">Select inventory item...</option>
              {items.filter((i) => i.is_active).map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
          </div>
          <Input
            label="Quantity Required (per serving)"
            type="number"
            step="any"
            min="0"
            value={recipeForm.quantity_required}
            onChange={(e) => setRecipeForm({ ...recipeForm, quantity_required: e.target.value })}
            placeholder="e.g. 0.5 for 500g if unit is kg"
          />
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setRecipeModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={recipeSaving} onClick={handleAddRecipe}>
            Add Ingredient
          </Button>
        </div>
      </Modal>
    </div>
  );
}
