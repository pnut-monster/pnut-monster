/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Modal, Badge, Spinner } from "@/components/ui";
import {
  Plus,
  Clock,
  Users,
  Package,
  FileText,
  Tag,
} from "lucide-react";
import toast from "react-hot-toast";

type BatchWindow = {
  id: string;
  outlet_id: string;
  hub_id: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  current_order_count: number;
  delivery_fee: number;
  counter_display_mode: string;
  counter_visual_style: string;
  status: string;
  closed_at: string | null;
  created_at: string;
};

type Outlet = { id: string; name: string; batch_config: Record<string, unknown> | null };
type Hub = { id: string; name: string };
type OutletHubLink = { outlet_id: string; hub_id: string };

type WindowForm = {
  outlet_id: string;
  hub_id: string;
  date: string;
  start_time: string;
  end_time: string;
  max_orders: string;
  delivery_fee: string;
  counter_display_mode: string;
  counter_visual_style: string;
};

const STATUS_COLORS: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  scheduled: "info",
  open: "success",
  closed: "warning",
  processing: "warning",
  fulfilled: "success",
  cancelled: "error",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function AdminBatchWindowsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [windows, setWindows] = useState<BatchWindow[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [outletHubLinks, setOutletHubLinks] = useState<OutletHubLink[]>([]);
  const [filter, setFilter] = useState<string>("all");

  // Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<WindowForm>({
    outlet_id: "",
    hub_id: "",
    date: new Date().toISOString().slice(0, 10),
    start_time: "09:30",
    end_time: "11:30",
    max_orders: "50",
    delivery_fee: "0",
    counter_display_mode: "exact",
    counter_visual_style: "static",
  });
  const [saving, setSaving] = useState(false);


  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [winRes, outRes, hubRes, linkRes] = await Promise.all([
      supabase.from("batch_windows").select("*").order("start_time", { ascending: false }).limit(100),
      supabase.from("outlets").select("id, name, batch_config").order("name"),
      supabase.from("delivery_hubs").select("id, name").eq("is_active", true),
      supabase.from("outlet_hub_links").select("*"),
    ]);
    if (winRes.data) setWindows(winRes.data as BatchWindow[]);
    if (outRes.data) setOutlets(outRes.data as Outlet[]);
    if (hubRes.data) setHubs(hubRes.data as Hub[]);
    if (linkRes.data) setOutletHubLinks(linkRes.data as OutletHubLink[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function getHubsForOutlet(outletId: string) {
    const hubIds = outletHubLinks.filter(l => l.outlet_id === outletId).map(l => l.hub_id);
    return hubs.filter(h => hubIds.includes(h.id));
  }

  function openCreateModal() {
    const defaultOutlet = outlets[0]?.id || "";
    const availableHubs = defaultOutlet ? getHubsForOutlet(defaultOutlet) : [];
    setForm({
      outlet_id: defaultOutlet,
      hub_id: availableHubs[0]?.id || "",
      date: new Date().toISOString().slice(0, 10),
      start_time: "09:30",
      end_time: "11:30",
      max_orders: "50",
      delivery_fee: "0",
      counter_display_mode: "exact",
      counter_visual_style: "static",
    });
    setModalOpen(true);
  }

  async function createWindow() {
    if (!form.outlet_id || !form.hub_id) { toast.error("Select outlet and hub"); return; }
    if (!form.date || !form.start_time || !form.end_time) { toast.error("Fill all time fields"); return; }
    const maxOrders = parseInt(form.max_orders);
    if (!maxOrders || maxOrders < 1) { toast.error("Max orders must be at least 1"); return; }

    const startIso = new Date(`${form.date}T${form.start_time}:00+05:30`).toISOString();
    const endIso = new Date(`${form.date}T${form.end_time}:00+05:30`).toISOString();

    if (new Date(endIso) <= new Date(startIso)) { toast.error("End time must be after start time"); return; }

    setSaving(true);
    const { error } = await supabase.from("batch_windows").insert({
      outlet_id: form.outlet_id,
      hub_id: form.hub_id,
      start_time: startIso,
      end_time: endIso,
      max_orders: maxOrders,
      delivery_fee: parseFloat(form.delivery_fee) || 0,
      counter_display_mode: form.counter_display_mode,
      counter_visual_style: form.counter_visual_style,
    } as never);

    if (error) {
      if (error.message.includes("idx_batch_windows_one_open_per_outlet")) {
        toast.error("This outlet already has an open batch window");
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success("Batch window created");
      setModalOpen(false);
    }
    setSaving(false);
    fetchAll();
  }

  async function closeWindow(windowId: string) {
    const { error } = await supabase.rpc("close_batch_window", { p_window_id: windowId });
    if (error) toast.error(error.message);
    else { toast.success("Window closed"); fetchAll(); }
  }

  async function cancelWindow(windowId: string) {
    if (!confirm("Cancel this batch and refund all orders?")) return;
    const { error } = await supabase.rpc("cancel_batch_window", { p_window_id: windowId });
    if (error) toast.error(error.message);
    else { toast.success("Batch cancelled, all orders refunded"); fetchAll(); }
  }

  async function distributeOrders(windowId: string) {
    const { error } = await supabase.rpc("distribute_batch_orders", { p_window_id: windowId });
    if (error) toast.error(error.message);
    else { toast.success("Orders distributed to reps"); fetchAll(); }
  }

  async function markOutForDelivery(windowId: string) {
    const { error } = await supabase.rpc("mark_batch_out_for_delivery", { p_window_id: windowId });
    if (error) toast.error(error.message);
    else { toast.success("Orders marked as out for delivery"); fetchAll(); }
  }

  const filtered = filter === "all" ? windows : windows.filter(w => w.status === filter);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch Windows</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage batch order windows</p>
        </div>
        <Button onClick={openCreateModal} className="gap-2">
          <Plus size={16} /> Create Window
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {["all", "scheduled", "open", "closed", "processing", "fulfilled", "cancelled"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === s ? "bg-brand-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== "all" && ` (${windows.filter(w => w.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Windows list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Clock size={40} className="mx-auto mb-3 opacity-50" />
          <p>No batch windows found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(win => {
            const outlet = outlets.find(o => o.id === win.outlet_id);
            const hub = hubs.find(h => h.id === win.hub_id);
            return (
              <div key={win.id} className="border border-gray-200 rounded-xl bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{outlet?.name || "Unknown Outlet"}</span>
                      <Badge variant={STATUS_COLORS[win.status] || "neutral"}>{win.status}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">{hub?.name || "Unknown Hub"}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {formatTime(win.start_time)} — {formatTime(win.end_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users size={12} /> {win.current_order_count}/{win.max_orders} orders
                      </span>
                      <span className="flex items-center gap-1">
                        <Package size={12} /> ₹{win.delivery_fee} delivery
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {win.status === "open" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => closeWindow(win.id)}>Close</Button>
                        <Button size="sm" variant="danger" onClick={() => cancelWindow(win.id)}>Cancel</Button>
                      </>
                    )}
                    {win.status === "closed" && (
                      <>
                        <Button size="sm" onClick={() => distributeOrders(win.id)}>Distribute</Button>
                        <Button size="sm" variant="danger" onClick={() => cancelWindow(win.id)}>Cancel</Button>
                      </>
                    )}
                    {win.status === "processing" && (
                      <Button size="sm" onClick={() => markOutForDelivery(win.id)}>Mark Out for Delivery</Button>
                    )}
                    {win.status === "scheduled" && (
                      <Button size="sm" variant="danger" onClick={() => cancelWindow(win.id)}>Cancel</Button>
                    )}
                  </div>
                </div>
                {/* Print views - show for windows that have orders */}
                {["closed", "processing", "fulfilled"].includes(win.status) && win.current_order_count > 0 && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <a href={`/admin/batch/windows/${win.id}/prep-sheet`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-700 transition-colors">
                      <FileText size={12} /> Prep Sheet
                    </a>
                    <a href={`/admin/batch/windows/${win.id}/labels`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-700 transition-colors">
                      <Tag size={12} /> Parcel Labels
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Window Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Create Batch Window">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
            <select value={form.outlet_id}
              onChange={e => {
                const outletId = e.target.value;
                const available = getHubsForOutlet(outletId);
                setForm(f => ({ ...f, outlet_id: outletId, hub_id: available[0]?.id || "" }));
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
              <option value="">Select outlet...</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {form.outlet_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hub</label>
              <select value={form.hub_id}
                onChange={e => setForm(f => ({ ...f, hub_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
                <option value="">Select hub...</option>
                {getHubsForOutlet(form.outlet_id).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          )}

          <Input label="Date" type="date" value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Time" type="time" value={form.start_time}
              onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            <Input label="End Time" type="time" value={form.end_time}
              onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Max Orders" type="number" value={form.max_orders}
              onChange={e => setForm(f => ({ ...f, max_orders: e.target.value }))} />
            <Input label="Delivery Fee (₹)" type="number" value={form.delivery_fee}
              onChange={e => setForm(f => ({ ...f, delivery_fee: e.target.value }))} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Counter Display Mode</label>
            <select value={form.counter_display_mode}
              onChange={e => setForm(f => ({ ...f, counter_display_mode: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
              <option value="exact">Exact Numbers</option>
              <option value="urgency">Vague Urgency</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Counter Visual Style</label>
            <select value={form.counter_visual_style}
              onChange={e => setForm(f => ({ ...f, counter_visual_style: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
              <option value="static">Static (icon + text)</option>
              <option value="animated">Animated Monster</option>
            </select>
          </div>

          <Button onClick={createWindow} disabled={saving} className="w-full">
            {saving ? "Creating..." : "Create Window"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
