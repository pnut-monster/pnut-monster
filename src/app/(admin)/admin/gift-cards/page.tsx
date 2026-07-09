"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils/helpers";
import { Button, Input, Modal, Spinner, Tabs } from "@/components/ui";
import {
  Plus,
  Search,
  Gift,
  Package,
  BarChart3,
  ClipboardList,
  CreditCard,
  TrendingUp,
  XCircle,
  CheckCircle2,
  Clock,
  Layers,
  Play,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ───
type GiftCardTemplate = {
  id: string;
  name: string;
  description: string | null;
  purchase_price: number;
  wallet_credit: number;
  validity_days: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type GiftCardBatch = {
  id: string;
  template_id: string;
  batch_name: string;
  quantity: number;
  code_format: string;
  code_prefix: string | null;
  generated_count: number;
  generated_at: string;
  created_by: string | null;
  created_at: string;
};

type GiftCard = {
  id: string;
  gift_card_id: string;
  redeem_code: string;
  template_id: string;
  batch_id: string;
  purchase_price: number;
  wallet_credit: number;
  status: string;
  expires_at: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  sold_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
};

type AuditLog = {
  id: string;
  entity_type: string;
  entity_id: string;
  admin_id: string | null;
  admin_name: string | null;
  action: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};

const PAGE_TABS = [
  { label: "Templates", value: "templates" },
  { label: "Batches", value: "batches" },
  { label: "Gift Cards", value: "cards" },
  { label: "Analytics", value: "analytics" },
  { label: "Audit Log", value: "audit" },
];

const TEMPLATE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  inactive: "bg-yellow-100 text-yellow-700",
  archived: "bg-gray-200 text-gray-500",
};

const CARD_STATUS_COLORS: Record<string, string> = {
  generated: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  reserved: "bg-blue-100 text-blue-700",
  sold: "bg-purple-100 text-purple-700",
  redeemed: "bg-emerald-100 text-emerald-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-gray-200 text-gray-500",
};

const CODE_FORMAT_LABELS: Record<string, string> = {
  alphanumeric_12: "12-char Alphanumeric",
  numeric_12: "12-digit Numeric",
  prefix_alphanumeric: "Prefix + Alphanumeric",
  prefix_3_numeric: "3-digit Prefix + Numeric",
};

type TemplateForm = {
  name: string;
  description: string;
  purchase_price: string;
  wallet_credit: string;
  validity_days: string;
  status: string;
  notes: string;
};

const EMPTY_TEMPLATE_FORM: TemplateForm = {
  name: "",
  description: "",
  purchase_price: "0",
  wallet_credit: "",
  validity_days: "365",
  status: "draft",
  notes: "",
};

type BatchForm = {
  template_id: string;
  batch_name: string;
  quantity: string;
  code_format: string;
  code_prefix: string;
};

const EMPTY_BATCH_FORM: BatchForm = {
  template_id: "",
  batch_name: "",
  quantity: "10",
  code_format: "alphanumeric_12",
  code_prefix: "",
};

export default function AdminGiftCardsPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState("templates");
  const [loading, setLoading] = useState(true);

  // Data
  const [templates, setTemplates] = useState<GiftCardTemplate[]>([]);
  const [batches, setBatches] = useState<GiftCardBatch[]>([]);
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Template modal
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<GiftCardTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(EMPTY_TEMPLATE_FORM);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Batch modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchForm, setBatchForm] = useState<BatchForm>(EMPTY_BATCH_FORM);
  const [batchGenerating, setBatchGenerating] = useState(false);

  // Cards filtering
  const [cardSearch, setCardSearch] = useState("");
  const [cardStatusFilter, setCardStatusFilter] = useState("all");
  const [cardPage, setCardPage] = useState(0);
  const CARDS_PAGE_SIZE = 25;

  // Analytics
  const [analytics, setAnalytics] = useState({
    total: 0, active: 0, redeemed: 0, expired: 0, pending: 0, cancelled: 0,
    totalWalletIssued: 0, totalRevenue: 0, redemptionRate: 0,
  });

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase.from("gift_card_templates").select("*").order("created_at", { ascending: false });
    setTemplates((data ?? []) as GiftCardTemplate[]);
  }, [supabase]);

  const fetchBatches = useCallback(async () => {
    const { data } = await supabase.from("gift_card_batches").select("*").order("created_at", { ascending: false });
    setBatches((data ?? []) as GiftCardBatch[]);
  }, [supabase]);

  const fetchCards = useCallback(async () => {
    const { data } = await supabase.from("gift_cards").select("*").order("created_at", { ascending: false }).limit(500);
    const rows = (data ?? []) as GiftCard[];
    setCards(rows);

    // Compute analytics
    const counts = { active: 0, redeemed: 0, expired: 0, pending: 0, cancelled: 0 };
    let totalWalletIssued = 0;
    let totalRevenue = 0;
    for (const c of rows) {
      if (c.status === "active" || c.status === "sold") counts.active++;
      else if (c.status === "redeemed") { counts.redeemed++; totalWalletIssued += c.wallet_credit; totalRevenue += c.purchase_price; }
      else if (c.status === "expired") counts.expired++;
      else if (c.status === "generated" || c.status === "reserved") counts.pending++;
      else if (c.status === "cancelled") counts.cancelled++;
    }
    setAnalytics({
      total: rows.length,
      ...counts,
      totalWalletIssued,
      totalRevenue,
      redemptionRate: rows.length > 0 ? Math.round((counts.redeemed / rows.length) * 100) : 0,
    });
  }, [supabase]);

  const fetchAuditLogs = useCallback(async () => {
    const { data } = await supabase.from("gift_card_audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
    setAuditLogs((data ?? []) as AuditLog[]);
  }, [supabase]);

  useEffect(() => {
    Promise.all([fetchTemplates(), fetchBatches(), fetchCards(), fetchAuditLogs()])
      .finally(() => setLoading(false));
  }, [fetchTemplates, fetchBatches, fetchCards, fetchAuditLogs]);

  // ─── Template CRUD ───
  const logAudit = async (entityType: string, entityId: string, action: string, prev: Record<string, unknown> | null, next: Record<string, unknown> | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("gift_card_audit_logs").insert({
      entity_type: entityType,
      entity_id: entityId,
      admin_id: user?.id ?? "",
      admin_name: user?.email ?? "Admin",
      action,
      previous_value: prev,
      new_value: next,
    } as never);
  };

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm(EMPTY_TEMPLATE_FORM);
    setTemplateModalOpen(true);
  };

  const openEditTemplate = (t: GiftCardTemplate) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      description: t.description ?? "",
      purchase_price: String(t.purchase_price),
      wallet_credit: String(t.wallet_credit),
      validity_days: String(t.validity_days),
      status: t.status,
      notes: t.notes ?? "",
    });
    setTemplateModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) { toast.error("Template name is required"); return; }
    if (!templateForm.wallet_credit || parseFloat(templateForm.wallet_credit) <= 0) { toast.error("Wallet credit must be > 0"); return; }

    setTemplateSaving(true);
    const payload = {
      name: templateForm.name.trim(),
      description: templateForm.description.trim() || null,
      purchase_price: parseFloat(templateForm.purchase_price) || 0,
      wallet_credit: parseFloat(templateForm.wallet_credit),
      validity_days: parseInt(templateForm.validity_days) || 365,
      status: templateForm.status,
      notes: templateForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingTemplate) {
        const { error } = await supabase.from("gift_card_templates").update(payload as never).eq("id", editingTemplate.id);
        if (error) throw error;
        await logAudit("template", editingTemplate.id, "template_updated", { name: editingTemplate.name, status: editingTemplate.status }, payload as never);
        toast.success("Template updated");
      } else {
        const { data, error } = await supabase.from("gift_card_templates").insert(payload as never).select("id").single();
        if (error) throw error;
        await logAudit("template", (data as { id: string }).id, "template_created", null, payload as never);
        toast.success("Template created");
      }
      setTemplateModalOpen(false);
      fetchTemplates();
      fetchAuditLogs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (t: GiftCardTemplate) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone if no batches use it.`)) return;
    const { error } = await supabase.from("gift_card_templates").delete().eq("id", t.id);
    if (error) {
      toast.error("Cannot delete: template has batches linked to it");
      return;
    }
    toast.success("Template deleted");
    fetchTemplates();
  };

  // ─── Batch Generation ───
  const openGenerateBatch = () => {
    setBatchForm(EMPTY_BATCH_FORM);
    setBatchModalOpen(true);
  };

  const handleGenerateBatch = async () => {
    if (!batchForm.template_id) { toast.error("Select a template"); return; }
    if (!batchForm.batch_name.trim()) { toast.error("Batch name is required"); return; }
    const qty = parseInt(batchForm.quantity);
    if (!qty || qty < 1 || qty > 1000) { toast.error("Quantity must be 1-1000"); return; }

    setBatchGenerating(true);
    try {
      const { data, error } = await supabase.rpc("generate_gift_card_batch" as never, {
        p_template_id: batchForm.template_id,
        p_batch_name: batchForm.batch_name.trim(),
        p_quantity: qty,
        p_code_format: batchForm.code_format,
        p_code_prefix: batchForm.code_prefix || null,
      } as never);

      if (error) throw error;
      const result = data as { batch_id: string; generated_count: number; template_name: string };
      toast.success(`Generated ${result.generated_count} gift cards for "${result.template_name}"`);
      setBatchModalOpen(false);
      fetchBatches();
      fetchCards();
      fetchAuditLogs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBatchGenerating(false);
    }
  };

  // ─── Card status changes ───
  const handleCardStatusChange = async (card: GiftCard, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === "cancelled") updates.cancelled_at = new Date().toISOString();
    if (newStatus === "sold") updates.sold_at = new Date().toISOString();

    await supabase.from("gift_cards").update(updates as never).eq("id", card.id);
    await logAudit("gift_card", card.id, "status_changed", { status: card.status }, { status: newStatus });
    toast.success(`Card ${card.gift_card_id} → ${newStatus}`);
    fetchCards();
    fetchAuditLogs();
  };

  // ─── Filtered cards ───
  const filteredCards = cards.filter(c => {
    if (cardStatusFilter !== "all" && c.status !== cardStatusFilter) return false;
    if (cardSearch) {
      const q = cardSearch.toLowerCase();
      return c.gift_card_id.toLowerCase().includes(q) || c.redeem_code.toLowerCase().includes(q);
    }
    return true;
  });
  const paginatedCards = filteredCards.slice(cardPage * CARDS_PAGE_SIZE, (cardPage + 1) * CARDS_PAGE_SIZE);
  const totalCardPages = Math.ceil(filteredCards.length / CARDS_PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs tabs={PAGE_TABS} value={activeTab} onChange={setActiveTab} />

      {/* ═══════════ TEMPLATES TAB ═══════════ */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
            <Button onClick={openCreateTemplate}><Plus className="w-4 h-4 mr-1" /> New Template</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Gift className="w-5 h-5 text-purple-500" />
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                      {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                    </div>
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", TEMPLATE_STATUS_COLORS[t.status])}>
                    {t.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg py-1.5">
                    <p className="text-[10px] text-gray-500">Price</p>
                    <p className="text-xs font-bold">{formatCurrency(t.purchase_price)}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg py-1.5">
                    <p className="text-[10px] text-gray-500">Credit</p>
                    <p className="text-xs font-bold text-purple-700">{formatCurrency(t.wallet_credit)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-1.5">
                    <p className="text-[10px] text-gray-500">Validity</p>
                    <p className="text-xs font-bold text-blue-700">{t.validity_days}d</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <button onClick={() => openEditTemplate(t)} className="text-xs text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => handleDeleteTemplate(t)} className="text-xs text-red-600 hover:underline">Delete</button>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-gray-400 col-span-3 text-center py-8">No templates yet. Create one to start generating gift cards.</p>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ BATCHES TAB ═══════════ */}
      {activeTab === "batches" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{batches.length} batch{batches.length !== 1 ? "es" : ""}</p>
            <Button onClick={openGenerateBatch}><Layers className="w-4 h-4 mr-1" /> Generate Batch</Button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Batch Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Template</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Format</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Generated</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {batches.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No batches yet</td></tr>
                )}
                {batches.map(b => {
                  const tpl = templates.find(t => t.id === b.template_id);
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{b.batch_name}</td>
                      <td className="px-4 py-3 text-gray-600">{tpl?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-md">
                          {CODE_FORMAT_LABELS[b.code_format] ?? b.code_format}
                        </span>
                        {b.code_prefix && <span className="text-xs text-gray-400 ml-1">({b.code_prefix})</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{b.generated_count}</span>
                        <span className="text-gray-400">/{b.quantity}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(b.generated_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ CARDS TAB ═══════════ */}
      {activeTab === "cards" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search by ID or code..." value={cardSearch}
                  onChange={e => { setCardSearch(e.target.value); setCardPage(0); }}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none" />
              </div>
              <select value={cardStatusFilter} onChange={e => { setCardStatusFilter(e.target.value); setCardPage(0); }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="sold">Sold</option>
                <option value="redeemed">Redeemed</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
                <option value="generated">Generated</option>
              </select>
            </div>
            <p className="text-xs text-gray-500">{filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}</p>
          </div>

          {/* Cards Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Gift Card ID</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Redeem Code</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Credit</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Expires</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedCards.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No gift cards found</td></tr>
                  )}
                  {paginatedCards.map(card => (
                    <tr key={card.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">{card.gift_card_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{card.redeem_code}</td>
                      <td className="px-4 py-3 font-medium text-purple-700">{formatCurrency(card.wallet_credit)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", CARD_STATUS_COLORS[card.status])}>
                          {card.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(card.expires_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {card.status === "active" && (
                            <>
                              <button onClick={() => handleCardStatusChange(card, "sold")} className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-600" title="Mark Sold">
                                <CreditCard className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleCardStatusChange(card, "cancelled")} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Cancel">
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {card.status === "sold" && (
                            <button onClick={() => handleCardStatusChange(card, "cancelled")} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Cancel">
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {card.status === "redeemed" && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalCardPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Page {cardPage + 1} of {totalCardPages}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCardPage(p => Math.max(0, p - 1))} disabled={cardPage === 0}
                    className="px-3 py-1 text-xs border rounded-md disabled:opacity-40">Prev</button>
                  <button onClick={() => setCardPage(p => Math.min(totalCardPages - 1, p + 1))} disabled={cardPage >= totalCardPages - 1}
                    className="px-3 py-1 text-xs border rounded-md disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ ANALYTICS TAB ═══════════ */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Total Generated" value={analytics.total} icon={<Package className="w-4 h-4 text-gray-500" />} />
            <StatCard label="Active" value={analytics.active} icon={<Play className="w-4 h-4 text-green-500" />} color="text-green-600" />
            <StatCard label="Redeemed" value={analytics.redeemed} icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} color="text-emerald-600" />
            <StatCard label="Expired" value={analytics.expired} icon={<Clock className="w-4 h-4 text-red-500" />} color="text-red-600" />
            <StatCard label="Pending" value={analytics.pending} icon={<Clock className="w-4 h-4 text-yellow-500" />} color="text-yellow-600" />
          </div>

          {/* Financial */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Wallet Points Issued" value={formatCurrency(analytics.totalWalletIssued)} icon={<Gift className="w-4 h-4 text-purple-500" />} />
            <StatCard label="Revenue Generated" value={formatCurrency(analytics.totalRevenue)} icon={<TrendingUp className="w-4 h-4 text-green-500" />} />
            <StatCard label="Redemption Rate" value={`${analytics.redemptionRate}%`} icon={<BarChart3 className="w-4 h-4 text-blue-500" />} />
          </div>

          {/* Batch Performance */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Batch Performance</h3>
            <div className="space-y-2">
              {batches.slice(0, 10).map(b => {
                const batchCards = cards.filter(c => c.batch_id === b.id);
                const redeemed = batchCards.filter(c => c.status === "redeemed").length;
                const rate = batchCards.length > 0 ? Math.round((redeemed / batchCards.length) * 100) : 0;
                return (
                  <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium">{b.batch_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{b.generated_count} cards</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{redeemed} redeemed</span>
                      <span className="text-xs font-medium text-purple-600">{rate}%</span>
                    </div>
                  </div>
                );
              })}
              {batches.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No batches yet</p>}
            </div>
          </div>

          {/* Template Performance */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Template Performance</h3>
            <div className="space-y-2">
              {templates.map(t => {
                const tplCards = cards.filter(c => c.template_id === t.id);
                const redeemed = tplCards.filter(c => c.status === "redeemed").length;
                const revenue = tplCards.filter(c => c.status === "redeemed").reduce((s, c) => s + c.purchase_price, 0);
                return (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{formatCurrency(t.wallet_credit)} credit</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{redeemed}/{tplCards.length}</span>
                      <span className="text-xs font-medium text-green-600">{formatCurrency(revenue)}</span>
                    </div>
                  </div>
                );
              })}
              {templates.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No templates yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ AUDIT LOG TAB ═══════════ */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Audit Log</h3>
            <p className="text-xs text-gray-500">All gift card system actions</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {auditLogs.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No audit logs yet</p>
            )}
            {auditLogs.map(log => (
              <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0 mt-0.5">
                  <ClipboardList className="w-3.5 h-3.5 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{log.admin_name ?? "System"}</span>
                    {" "}<span className="text-gray-500">{log.action.replace(/_/g, " ")}</span>
                    {log.new_value && (log.new_value as { gift_card_id?: string; batch_name?: string; name?: string }).gift_card_id && (
                      <span className="font-mono ml-1 text-gray-700 text-xs">{(log.new_value as { gift_card_id: string }).gift_card_id}</span>
                    )}
                    {log.new_value && (log.new_value as { batch_name?: string }).batch_name && (
                      <span className="ml-1 text-gray-700">&quot;{(log.new_value as { batch_name: string }).batch_name}&quot;</span>
                    )}
                    {log.new_value && (log.new_value as { name?: string }).name && !((log.new_value as { batch_name?: string }).batch_name) && (
                      <span className="ml-1 text-gray-700">&quot;{(log.new_value as { name: string }).name}&quot;</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ TEMPLATE MODAL ═══════════ */}
      <Modal open={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={editingTemplate ? "Edit Template" : "New Template"}>
        <div className="space-y-4">
          <Input label="Template Name *" value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Birthday Gift Card" />
          <Input label="Description" value={templateForm.description} onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" label="Purchase Price (₹)" value={templateForm.purchase_price} onChange={e => setTemplateForm(f => ({ ...f, purchase_price: e.target.value }))} />
            <Input type="number" label="Wallet Credit (₹) *" value={templateForm.wallet_credit} onChange={e => setTemplateForm(f => ({ ...f, wallet_credit: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" label="Validity (days)" value={templateForm.validity_days} onChange={e => setTemplateForm(f => ({ ...f, validity_days: e.target.value }))} />
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
              <select value={templateForm.status} onChange={e => setTemplateForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <Input label="Notes" value={templateForm.notes} onChange={e => setTemplateForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." />
        </div>
        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setTemplateModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveTemplate} disabled={templateSaving}>
            {templateSaving ? "Saving..." : editingTemplate ? "Update" : "Create Template"}
          </Button>
        </div>
      </Modal>

      {/* ═══════════ BATCH GENERATION MODAL ═══════════ */}
      <Modal open={batchModalOpen} onClose={() => setBatchModalOpen(false)} title="Generate Gift Card Batch">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Template *</label>
            <select value={batchForm.template_id} onChange={e => setBatchForm(f => ({ ...f, template_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200">
              <option value="">Select template...</option>
              {templates.filter(t => t.status === "active").map(t => (
                <option key={t.id} value={t.id}>{t.name} ({formatCurrency(t.wallet_credit)} credit)</option>
              ))}
            </select>
          </div>
          <Input label="Batch Name *" value={batchForm.batch_name} onChange={e => setBatchForm(f => ({ ...f, batch_name: e.target.value }))} placeholder="e.g. July 2026 Promo" />
          <Input type="number" label="Quantity (1-1000) *" value={batchForm.quantity} onChange={e => setBatchForm(f => ({ ...f, quantity: e.target.value }))} />
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Code Format</label>
            <select value={batchForm.code_format} onChange={e => setBatchForm(f => ({ ...f, code_format: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-200">
              {Object.entries(CODE_FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          {(batchForm.code_format === "prefix_alphanumeric" || batchForm.code_format === "prefix_3_numeric") && (
            <Input label="Code Prefix" value={batchForm.code_prefix} onChange={e => setBatchForm(f => ({ ...f, code_prefix: e.target.value }))} placeholder="e.g. GC or PNT" />
          )}
        </div>
        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setBatchModalOpen(false)}>Cancel</Button>
          <Button onClick={handleGenerateBatch} disabled={batchGenerating}>
            {batchGenerating ? "Generating..." : "Generate Cards"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

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
