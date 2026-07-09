"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils/helpers";
import { Button, Input, Modal, Spinner, Tabs } from "@/components/ui";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Search,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Archive,
  Tag,
  ClipboardList,
  Ticket,
  Calendar,
  ShoppingBag,
  TrendingUp,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ───
type CouponRow = {
  id: string;
  code: string;
  name: string | null;
  description: string;
  discount_type: "percentage" | "flat";
  discount_type_ext: string | null;
  discount_value: number;
  min_order: number;
  min_cart_value: number;
  max_discount: number | null;
  usage_limit: number | null;
  used_count: number;
  per_user_limit: number | null;
  daily_limit: number | null;
  priority: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  status: string;
  campaign_id: string | null;
  customer_eligibility: string;
  buy_x_qty: number | null;
  get_y_qty: number | null;
  free_product_id: string | null;
  applicable_type: string;
  applicable_product_ids: string[];
  applicable_category_ids: string[];
  created_at: string;
  updated_at: string | null;
};

type CouponCampaign = {
  id: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
};

type AuditLog = {
  id: string;
  coupon_id: string | null;
  admin_id: string;
  admin_name: string | null;
  action: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};

type OutletSimple = {
  id: string;
  name: string;
};

type CouponForm = {
  name: string;
  code: string;
  description: string;
  discount_type: string;
  discount_type_ext: string;
  discount_value: string;
  min_order: string;
  min_cart_value: string;
  max_discount: string;
  usage_limit: string;
  per_user_limit: string;
  daily_limit: string;
  priority: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  status: string;
  campaign_id: string;
  customer_eligibility: string;
  buy_x_qty: string;
  get_y_qty: string;
  applicable_type: string;
  applicable_product_ids: string[];
  applicable_category_ids: string[];
  outlet_ids: string[];
};

const EMPTY_FORM: CouponForm = {
  name: "",
  code: "",
  description: "",
  discount_type: "percentage",
  discount_type_ext: "percentage",
  discount_value: "",
  min_order: "0",
  min_cart_value: "0",
  max_discount: "",
  usage_limit: "",
  per_user_limit: "",
  daily_limit: "",
  priority: "0",
  starts_at: "",
  ends_at: "",
  is_active: true,
  status: "active",
  campaign_id: "",
  customer_eligibility: "all",
  buy_x_qty: "",
  get_y_qty: "",
  applicable_type: "all",
  applicable_product_ids: [],
  applicable_category_ids: [],
  outlet_ids: [],
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  expired: "bg-red-100 text-red-700",
  archived: "bg-gray-200 text-gray-500",
};

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  percentage: "Percentage",
  flat: "Flat Discount",
  free_delivery: "Free Delivery",
  buy_x_get_y: "Buy X Get Y",
  free_product: "Free Product",
};

const ELIGIBILITY_LABELS: Record<string, string> = {
  all: "All Customers",
  new: "New Customers",
  existing: "Existing Customers",
  premium: "Premium Members",
  student: "Student Members",
};

const PAGE_TABS = [
  { label: "All Coupons", value: "coupons" },
  { label: "Campaigns", value: "campaigns" },
  { label: "Analytics", value: "analytics" },
  { label: "Audit Log", value: "audit" },
];

function computeStatus(coupon: { starts_at: string; ends_at: string; is_active: boolean; status: string }): string {
  if (coupon.status === "archived" || coupon.status === "paused" || coupon.status === "draft") return coupon.status;
  const now = new Date();
  const start = new Date(coupon.starts_at);
  const end = new Date(coupon.ends_at);
  if (now < start) return "scheduled";
  if (now > end) return "expired";
  if (!coupon.is_active) return "paused";
  return "active";
}

export default function AdminCouponsPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState("coupons");
  const [loading, setLoading] = useState(true);

  // Coupons state
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [filteredCoupons, setFilteredCoupons] = useState<CouponRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<"created_at" | "code" | "used_count" | "priority">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<CouponRow | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Supporting data
  const [campaigns, setCampaigns] = useState<CouponCampaign[]>([]);
  const [outlets, setOutlets] = useState<OutletSimple[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [couponOutlets, setCouponOutlets] = useState<Record<string, string[]>>({});

  // Analytics
  const [analytics, setAnalytics] = useState({
    total: 0,
    active: 0,
    scheduled: 0,
    expired: 0,
    archived: 0,
    paused: 0,
    totalRedeemed: 0,
    totalDiscount: 0,
    avgDiscount: 0,
  });

  // Campaign modal
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CouponCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", starts_at: "", ends_at: "", status: "active" });

  const fetchCoupons = useCallback(async () => {
    const { data } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as CouponRow[];
    setCoupons(rows);

    // Compute analytics
    let totalRedeemed = 0;
    let totalDiscount = 0;
    const statusCounts = { active: 0, scheduled: 0, expired: 0, archived: 0, paused: 0 };
    for (const c of rows) {
      const s = computeStatus(c);
      if (s in statusCounts) statusCounts[s as keyof typeof statusCounts]++;
      totalRedeemed += c.used_count;
    }

    // Fetch total discount from coupon_usage
    const { data: usageData } = await supabase
      .from("coupon_usage")
      .select("discount_amount");
    if (usageData) {
      totalDiscount = (usageData as { discount_amount: number }[]).reduce((s, u) => s + u.discount_amount, 0);
    }

    setAnalytics({
      total: rows.length,
      ...statusCounts,
      totalRedeemed,
      totalDiscount,
      avgDiscount: totalRedeemed > 0 ? totalDiscount / totalRedeemed : 0,
    });
  }, [supabase]);

  const fetchCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from("coupon_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setCampaigns((data ?? []) as CouponCampaign[]);
  }, [supabase]);

  const fetchOutlets = useCallback(async () => {
    const { data } = await supabase
      .from("outlets")
      .select("id, name")
      .eq("is_active", true);
    setOutlets((data ?? []) as OutletSimple[]);
  }, [supabase]);

  const fetchAuditLogs = useCallback(async () => {
    const { data } = await supabase
      .from("coupon_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setAuditLogs((data ?? []) as AuditLog[]);
  }, [supabase]);

  const fetchOutletRestrictions = useCallback(async () => {
    const { data } = await supabase
      .from("coupon_outlet_restrictions")
      .select("coupon_id, outlet_id");
    const map: Record<string, string[]> = {};
    for (const row of (data ?? []) as { coupon_id: string; outlet_id: string }[]) {
      if (!map[row.coupon_id]) map[row.coupon_id] = [];
      map[row.coupon_id].push(row.outlet_id);
    }
    setCouponOutlets(map);
  }, [supabase]);

  useEffect(() => {
    Promise.all([fetchCoupons(), fetchCampaigns(), fetchOutlets(), fetchAuditLogs(), fetchOutletRestrictions()])
      .finally(() => setLoading(false));
  }, [fetchCoupons, fetchCampaigns, fetchOutlets, fetchAuditLogs, fetchOutletRestrictions]);

  // Filter & sort coupons
  useEffect(() => {
    let result = [...coupons];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.code.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(c => computeStatus(c) === statusFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "created_at") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortField === "code") cmp = a.code.localeCompare(b.code);
      else if (sortField === "used_count") cmp = a.used_count - b.used_count;
      else if (sortField === "priority") cmp = (a.priority ?? 0) - (b.priority ?? 0);
      return sortDir === "desc" ? -cmp : cmp;
    });

    setFilteredCoupons(result);
    setPage(0);
  }, [coupons, searchQuery, statusFilter, sortField, sortDir]);

  const paginatedCoupons = filteredCoupons.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredCoupons.length / PAGE_SIZE);

  // ─── CRUD Operations ───
  const logAudit = async (couponId: string | null, action: string, prev: Record<string, unknown> | null, next: Record<string, unknown> | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("coupon_audit_logs").insert({
      coupon_id: couponId,
      admin_id: user?.id ?? "",
      admin_name: user?.email ?? "Admin",
      action,
      previous_value: prev,
      new_value: next,
    } as never);
  };

  const openCreate = () => {
    setEditingCoupon(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (coupon: CouponRow) => {
    setEditingCoupon(coupon);
    setForm({
      name: coupon.name ?? "",
      code: coupon.code,
      description: coupon.description,
      discount_type: coupon.discount_type,
      discount_type_ext: coupon.discount_type_ext ?? coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order: String(coupon.min_order),
      min_cart_value: String(coupon.min_cart_value ?? 0),
      max_discount: coupon.max_discount ? String(coupon.max_discount) : "",
      usage_limit: coupon.usage_limit ? String(coupon.usage_limit) : "",
      per_user_limit: coupon.per_user_limit ? String(coupon.per_user_limit) : "",
      daily_limit: coupon.daily_limit ? String(coupon.daily_limit) : "",
      priority: String(coupon.priority ?? 0),
      starts_at: coupon.starts_at ? new Date(coupon.starts_at).toISOString().slice(0, 16) : "",
      ends_at: coupon.ends_at ? new Date(coupon.ends_at).toISOString().slice(0, 16) : "",
      is_active: coupon.is_active,
      status: coupon.status,
      campaign_id: coupon.campaign_id ?? "",
      customer_eligibility: coupon.customer_eligibility ?? "all",
      buy_x_qty: coupon.buy_x_qty ? String(coupon.buy_x_qty) : "",
      get_y_qty: coupon.get_y_qty ? String(coupon.get_y_qty) : "",
      applicable_type: coupon.applicable_type ?? "all",
      applicable_product_ids: coupon.applicable_product_ids ?? [],
      applicable_category_ids: coupon.applicable_category_ids ?? [],
      outlet_ids: couponOutlets[coupon.id] ?? [],
    });
    setModalOpen(true);
  };

  const handleDuplicate = (coupon: CouponRow) => {
    setEditingCoupon(null);
    setForm({
      name: (coupon.name ?? "") + " (Copy)",
      code: coupon.code + "_COPY",
      description: coupon.description,
      discount_type: coupon.discount_type,
      discount_type_ext: coupon.discount_type_ext ?? coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order: String(coupon.min_order),
      min_cart_value: String(coupon.min_cart_value ?? 0),
      max_discount: coupon.max_discount ? String(coupon.max_discount) : "",
      usage_limit: coupon.usage_limit ? String(coupon.usage_limit) : "",
      per_user_limit: coupon.per_user_limit ? String(coupon.per_user_limit) : "",
      daily_limit: coupon.daily_limit ? String(coupon.daily_limit) : "",
      priority: String(coupon.priority ?? 0),
      starts_at: "",
      ends_at: "",
      is_active: true,
      status: "draft",
      campaign_id: coupon.campaign_id ?? "",
      customer_eligibility: coupon.customer_eligibility ?? "all",
      buy_x_qty: coupon.buy_x_qty ? String(coupon.buy_x_qty) : "",
      get_y_qty: coupon.get_y_qty ? String(coupon.get_y_qty) : "",
      applicable_type: coupon.applicable_type ?? "all",
      applicable_product_ids: coupon.applicable_product_ids ?? [],
      applicable_category_ids: coupon.applicable_category_ids ?? [],
      outlet_ids: couponOutlets[coupon.id] ?? [],
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error("Coupon code is required"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    if (!form.discount_value || parseFloat(form.discount_value) <= 0) { toast.error("Discount value must be > 0"); return; }
    if (!form.starts_at || !form.ends_at) { toast.error("Validity dates are required"); return; }

    setSaving(true);

    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim() || null,
      description: form.description.trim(),
      discount_type: form.discount_type_ext === "free_delivery" || form.discount_type_ext === "buy_x_get_y" || form.discount_type_ext === "free_product" ? "flat" : form.discount_type_ext,
      discount_type_ext: form.discount_type_ext,
      discount_value: parseFloat(form.discount_value) || 0,
      min_order: parseFloat(form.min_order) || 0,
      min_cart_value: parseFloat(form.min_cart_value) || 0,
      max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
      usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
      per_user_limit: form.per_user_limit ? parseInt(form.per_user_limit) : null,
      daily_limit: form.daily_limit ? parseInt(form.daily_limit) : null,
      priority: parseInt(form.priority) || 0,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      is_active: form.is_active,
      status: form.status,
      campaign_id: form.campaign_id || null,
      customer_eligibility: form.customer_eligibility,
      buy_x_qty: form.buy_x_qty ? parseInt(form.buy_x_qty) : null,
      get_y_qty: form.get_y_qty ? parseInt(form.get_y_qty) : null,
      applicable_type: form.applicable_type,
      applicable_product_ids: form.applicable_product_ids,
      applicable_category_ids: form.applicable_category_ids,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingCoupon) {
        const { error } = await supabase
          .from("coupons")
          .update(payload as never)
          .eq("id", editingCoupon.id);
        if (error) throw error;

        // Update outlet restrictions
        await supabase.from("coupon_outlet_restrictions").delete().eq("coupon_id", editingCoupon.id);
        if (form.outlet_ids.length > 0) {
          await supabase.from("coupon_outlet_restrictions").insert(
            form.outlet_ids.map(oid => ({ coupon_id: editingCoupon.id, outlet_id: oid })) as never
          );
        }

        await logAudit(editingCoupon.id, "updated", { code: editingCoupon.code }, payload as never);
        toast.success("Coupon updated");
      } else {
        const { data, error } = await supabase
          .from("coupons")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;

        const newId = (data as { id: string }).id;

        if (form.outlet_ids.length > 0) {
          await supabase.from("coupon_outlet_restrictions").insert(
            form.outlet_ids.map(oid => ({ coupon_id: newId, outlet_id: oid })) as never
          );
        }

        await logAudit(newId, "created", null, payload as never);
        toast.success("Coupon created");
      }

      setModalOpen(false);
      fetchCoupons();
      fetchOutletRestrictions();
      fetchAuditLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save coupon";
      if (msg.includes("duplicate key") || msg.includes("unique")) {
        toast.error("Coupon code already exists");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (coupon: CouponRow) => {
    if (!confirm(`Delete coupon "${coupon.code}"? This cannot be undone.`)) return;
    await supabase.from("coupons").delete().eq("id", coupon.id);
    await logAudit(coupon.id, "deleted", { code: coupon.code, status: coupon.status }, null);
    toast.success("Coupon deleted");
    fetchCoupons();
    fetchAuditLogs();
  };

  const handleStatusChange = async (coupon: CouponRow, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === "active") updates.is_active = true;
    if (newStatus === "paused") updates.is_active = false;
    if (newStatus === "archived") updates.is_active = false;

    await supabase.from("coupons").update(updates as never).eq("id", coupon.id);
    await logAudit(coupon.id, newStatus === "active" ? "activated" : newStatus === "paused" ? "paused" : "archived",
      { status: coupon.status }, { status: newStatus });
    toast.success(`Coupon ${newStatus}`);
    fetchCoupons();
    fetchAuditLogs();
  };

  // ─── Campaign CRUD ───
  const handleSaveCampaign = async () => {
    if (!campaignForm.name.trim()) { toast.error("Campaign name is required"); return; }
    if (!campaignForm.starts_at || !campaignForm.ends_at) { toast.error("Dates required"); return; }

    const payload = {
      name: campaignForm.name.trim(),
      description: campaignForm.description.trim() || null,
      starts_at: new Date(campaignForm.starts_at).toISOString(),
      ends_at: new Date(campaignForm.ends_at).toISOString(),
      status: campaignForm.status,
      updated_at: new Date().toISOString(),
    };

    if (editingCampaign) {
      await supabase.from("coupon_campaigns").update(payload as never).eq("id", editingCampaign.id);
      toast.success("Campaign updated");
    } else {
      await supabase.from("coupon_campaigns").insert(payload as never);
      toast.success("Campaign created");
    }
    setCampaignModalOpen(false);
    fetchCampaigns();
  };

  const handleDeleteCampaign = async (c: CouponCampaign) => {
    if (!confirm(`Delete campaign "${c.name}"?`)) return;
    await supabase.from("coupon_campaigns").delete().eq("id", c.id);
    toast.success("Campaign deleted");
    fetchCampaigns();
  };

  // ─── Sort handler ───
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <Tabs tabs={PAGE_TABS} value={activeTab} onChange={setActiveTab} />

      {/* ═══════════ COUPONS TAB ═══════════ */}
      {activeTab === "coupons" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search coupons..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-yellow/50 outline-none"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="scheduled">Scheduled</option>
                <option value="paused">Paused</option>
                <option value="expired">Expired</option>
                <option value="archived">Archived</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <Button onClick={openCreate} className="shrink-0">
              <Plus className="w-4 h-4 mr-1" /> Create Coupon
            </Button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer" onClick={() => handleSort("code")}>
                      <div className="flex items-center gap-1">
                        Code {sortField === "code" && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Discount</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer" onClick={() => handleSort("used_count")}>
                      <div className="flex items-center gap-1">
                        Used {sortField === "used_count" && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Validity</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedCoupons.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No coupons found</td></tr>
                  )}
                  {paginatedCoupons.map(coupon => {
                    const status = computeStatus(coupon);
                    return (
                      <tr key={coupon.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-mono font-bold text-gray-900">{coupon.code}</p>
                            {coupon.name && <p className="text-xs text-gray-500">{coupon.name}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-md">
                            {DISCOUNT_TYPE_LABELS[coupon.discount_type_ext ?? coupon.discount_type] ?? coupon.discount_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {coupon.discount_type === "percentage"
                            ? `${coupon.discount_value}%${coupon.max_discount ? ` (max ${formatCurrency(coupon.max_discount)})` : ""}`
                            : formatCurrency(coupon.discount_value)
                          }
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs px-2 py-1 rounded-full font-medium", STATUS_COLORS[status])}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-700">{coupon.used_count}</span>
                          {coupon.usage_limit && <span className="text-gray-400">/{coupon.usage_limit}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          <div>{new Date(coupon.starts_at).toLocaleDateString()}</div>
                          <div>{new Date(coupon.ends_at).toLocaleDateString()}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {status === "active" && (
                              <button onClick={() => handleStatusChange(coupon, "paused")} className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600" title="Pause">
                                <Pause className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {status === "paused" && (
                              <button onClick={() => handleStatusChange(coupon, "active")} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="Activate">
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {status !== "archived" && (
                              <button onClick={() => handleStatusChange(coupon, "archived")} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title="Archive">
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => openEdit(coupon)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDuplicate(coupon)} className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-600" title="Duplicate">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(coupon)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredCoupons.length)} of {filteredCoupons.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-3 py-1 text-xs border rounded-md disabled:opacity-40">Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className="px-3 py-1 text-xs border rounded-md disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ CAMPAIGNS TAB ═══════════ */}
      {activeTab === "campaigns" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</p>
            <Button onClick={() => { setEditingCampaign(null); setCampaignForm({ name: "", description: "", starts_at: "", ends_at: "", status: "active" }); setCampaignModalOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> New Campaign
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {campaigns.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600")}>
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{new Date(c.starts_at).toLocaleDateString()} → {new Date(c.ends_at).toLocaleDateString()}</span>
                  <span>{coupons.filter(cp => cp.campaign_id === c.id).length} coupons</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditingCampaign(c); setCampaignForm({ name: c.name, description: c.description ?? "", starts_at: new Date(c.starts_at).toISOString().slice(0, 16), ends_at: new Date(c.ends_at).toISOString().slice(0, 16), status: c.status }); setCampaignModalOpen(true); }}
                    className="text-xs text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => handleDeleteCampaign(c)} className="text-xs text-red-600 hover:underline">Delete</button>
                </div>
              </div>
            ))}
            {campaigns.length === 0 && (
              <p className="text-sm text-gray-400 col-span-2 text-center py-8">No campaigns yet</p>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ ANALYTICS TAB ═══════════ */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Total Coupons" value={analytics.total} icon={<Ticket className="w-4 h-4" />} />
            <StatCard label="Active" value={analytics.active} icon={<Play className="w-4 h-4 text-green-500" />} color="text-green-600" />
            <StatCard label="Scheduled" value={analytics.scheduled} icon={<Calendar className="w-4 h-4 text-blue-500" />} color="text-blue-600" />
            <StatCard label="Expired" value={analytics.expired} icon={<X className="w-4 h-4 text-red-500" />} color="text-red-600" />
            <StatCard label="Archived" value={analytics.archived} icon={<Archive className="w-4 h-4 text-gray-400" />} color="text-gray-500" />
          </div>

          {/* Financial */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Total Redeemed" value={analytics.totalRedeemed} icon={<ShoppingBag className="w-4 h-4 text-purple-500" />} />
            <StatCard label="Total Discount Given" value={formatCurrency(analytics.totalDiscount)} icon={<Tag className="w-4 h-4 text-orange-500" />} />
            <StatCard label="Avg Discount" value={formatCurrency(analytics.avgDiscount)} icon={<TrendingUp className="w-4 h-4 text-blue-500" />} />
          </div>

          {/* Top Performing */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Top Performing Coupons</h3>
            <div className="space-y-2">
              {[...coupons].sort((a, b) => b.used_count - a.used_count).slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="font-mono font-medium text-sm">{c.code}</span>
                    {c.name && <span className="text-xs text-gray-400 ml-2">{c.name}</span>}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium">{c.used_count} used</span>
                    {c.usage_limit && <span className="text-xs text-gray-400 ml-1">/ {c.usage_limit}</span>}
                  </div>
                </div>
              ))}
              {coupons.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No data yet</p>}
            </div>
          </div>

          {/* Outlet Analytics */}
          {Object.keys(couponOutlets).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Outlet-Restricted Coupons</h3>
              <div className="space-y-2">
                {outlets.map(outlet => {
                  const restricted = Object.entries(couponOutlets).filter(([, oids]) => oids.includes(outlet.id));
                  if (restricted.length === 0) return null;
                  return (
                    <div key={outlet.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-700">{outlet.name}</span>
                      <span className="text-xs text-gray-400">{restricted.length} coupon{restricted.length !== 1 ? "s" : ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ AUDIT LOG TAB ═══════════ */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Audit Log</h3>
            <p className="text-xs text-gray-500">Recent admin actions on coupons</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {auditLogs.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No audit logs yet</p>
            )}
            {auditLogs.map(log => (
              <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <ClipboardList className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{log.admin_name ?? "Admin"}</span>
                    {" "}<span className="text-gray-500">{log.action}</span>
                    {log.new_value && (log.new_value as { code?: string }).code && (
                      <span className="font-mono ml-1 text-gray-700">{(log.new_value as { code: string }).code}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ COUPON CREATE/EDIT MODAL ═══════════ */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingCoupon ? "Edit Coupon" : "Create Coupon"}>
        <div className="space-y-5 max-h-[70vh] overflow-y-auto px-1">
          {/* Basic Details */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Basic Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Coupon Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Summer Sale" />
              <Input label="Coupon Code *" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SUMMER50" />
            </div>
            <Input label="Description *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Get 50% off on your order" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Campaign</label>
                <select value={form.campaign_id} onChange={e => setForm(f => ({ ...f, campaign_id: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-yellow/50">
                  <option value="">None</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-yellow/50">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>
          </section>

          {/* Validity */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coupon Validity</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input type="datetime-local" label="Start Date & Time *" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
              <Input type="datetime-local" label="End Date & Time *" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
            </div>
          </section>

          {/* Discount Configuration */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Discount Configuration</h4>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Discount Type *</label>
              <select value={form.discount_type_ext} onChange={e => {
                const v = e.target.value;
                setForm(f => ({ ...f, discount_type_ext: v, discount_type: (v === "percentage" ? "percentage" : "flat") }));
              }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-yellow/50">
                <option value="percentage">Percentage Discount</option>
                <option value="flat">Flat Discount</option>
                <option value="free_delivery">Free Delivery</option>
                <option value="buy_x_get_y">Buy X Get Y</option>
                <option value="free_product">Free Product</option>
              </select>
            </div>

            {(form.discount_type_ext === "percentage" || form.discount_type_ext === "flat") && (
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" label={form.discount_type_ext === "percentage" ? "Percentage *" : "Amount *"}
                  value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} />
                {form.discount_type_ext === "percentage" && (
                  <Input type="number" label="Maximum Discount" value={form.max_discount} onChange={e => setForm(f => ({ ...f, max_discount: e.target.value }))} placeholder="No limit" />
                )}
              </div>
            )}

            {form.discount_type_ext === "free_delivery" && (
              <Input type="number" label="Discount Value (delivery charge)" value={form.discount_value}
                onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} placeholder="e.g. 50" />
            )}

            {form.discount_type_ext === "buy_x_get_y" && (
              <div className="grid grid-cols-3 gap-3">
                <Input type="number" label="Buy X Qty" value={form.buy_x_qty} onChange={e => setForm(f => ({ ...f, buy_x_qty: e.target.value }))} />
                <Input type="number" label="Get Y Qty" value={form.get_y_qty} onChange={e => setForm(f => ({ ...f, get_y_qty: e.target.value }))} />
                <Input type="number" label="Discount Value" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} placeholder="0 for free" />
              </div>
            )}

            {form.discount_type_ext === "free_product" && (
              <Input type="number" label="Discount Value (product price)" value={form.discount_value}
                onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} />
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input type="number" label="Min Order Value" value={form.min_order} onChange={e => setForm(f => ({ ...f, min_order: e.target.value }))} />
              <Input type="number" label="Min Cart Value" value={form.min_cart_value} onChange={e => setForm(f => ({ ...f, min_cart_value: e.target.value }))} />
            </div>
          </section>

          {/* Usage Limits */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Usage Limits</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input type="number" label="Max Redemptions" value={form.usage_limit} onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))} placeholder="∞" />
              <Input type="number" label="Per User Limit" value={form.per_user_limit} onChange={e => setForm(f => ({ ...f, per_user_limit: e.target.value }))} placeholder="∞" />
              <Input type="number" label="Daily Limit" value={form.daily_limit} onChange={e => setForm(f => ({ ...f, daily_limit: e.target.value }))} placeholder="∞" />
              <Input type="number" label="Priority" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} placeholder="0" />
            </div>
          </section>

          {/* Applicability */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Applicable Products & Categories</h4>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Applies To</label>
              <select value={form.applicable_type} onChange={e => setForm(f => ({ ...f, applicable_type: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-yellow/50">
                <option value="all">Entire Menu</option>
                <option value="products">Specific Products</option>
                <option value="categories">Specific Categories</option>
              </select>
            </div>
          </section>

          {/* Outlet Restrictions */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Outlet Restrictions</h4>
            <p className="text-xs text-gray-500">Leave empty for all outlets</p>
            <div className="flex flex-wrap gap-2">
              {outlets.map(outlet => (
                <label key={outlet.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.outlet_ids.includes(outlet.id)}
                    onChange={e => {
                      setForm(f => ({
                        ...f,
                        outlet_ids: e.target.checked
                          ? [...f.outlet_ids, outlet.id]
                          : f.outlet_ids.filter(id => id !== outlet.id),
                      }));
                    }}
                    className="rounded border-gray-300"
                  />
                  {outlet.name}
                </label>
              ))}
            </div>
          </section>

          {/* Customer Eligibility */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer Eligibility</h4>
            <select value={form.customer_eligibility} onChange={e => setForm(f => ({ ...f, customer_eligibility: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-yellow/50">
              {Object.entries(ELIGIBILITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editingCoupon ? "Update Coupon" : "Create Coupon"}
          </Button>
        </div>
      </Modal>

      {/* ═══════════ CAMPAIGN MODAL ═══════════ */}
      <Modal open={campaignModalOpen} onClose={() => setCampaignModalOpen(false)} title={editingCampaign ? "Edit Campaign" : "New Campaign"}>
        <div className="space-y-3">
          <Input label="Campaign Name *" value={campaignForm.name} onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Description" value={campaignForm.description} onChange={e => setCampaignForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="datetime-local" label="Start Date *" value={campaignForm.starts_at} onChange={e => setCampaignForm(f => ({ ...f, starts_at: e.target.value }))} />
            <Input type="datetime-local" label="End Date *" value={campaignForm.ends_at} onChange={e => setCampaignForm(f => ({ ...f, ends_at: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
            <select value={campaignForm.status} onChange={e => setCampaignForm(f => ({ ...f, status: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-yellow/50">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setCampaignModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveCampaign}>{editingCampaign ? "Update" : "Create"}</Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Stat Card Component ───
function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={cn("text-xl font-bold", color ?? "text-gray-900")}>{value}</p>
    </div>
  );
}
