/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Modal, Badge, Spinner } from "@/components/ui";
import {
  Plus,
  Pencil,
  UserCheck,
  UserX,
  Phone,
  Building2,
  MapPin,
  IndianRupee,
} from "lucide-react";
import toast from "react-hot-toast";

type Rep = {
  id: string;
  user_id: string;
  outlet_id: string;
  block_id: string;
  name: string;
  phone: string | null;
  commission_type: string;
  commission_value: number;
  is_active: boolean;
  created_at: string;
};

type Block = { id: string; hub_id: string; name: string };
type Outlet = { id: string; name: string };
type Hub = { id: string; name: string };
type OutletHubLink = { outlet_id: string; hub_id: string };

type RepForm = {
  name: string;
  email: string;
  password: string;
  phone: string;
  outlet_id: string;
  block_id: string;
  commission_type: string;
  commission_value: string;
};

const EMPTY_FORM: RepForm = {
  name: "",
  email: "",
  password: "",
  phone: "",
  outlet_id: "",
  block_id: "",
  commission_type: "flat_per_order",
  commission_value: "5",
};

export default function AdminBatchRepsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [reps, setReps] = useState<Rep[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [outletHubLinks, setOutletHubLinks] = useState<OutletHubLink[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<Rep | null>(null);
  const [form, setForm] = useState<RepForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [repRes, blockRes, outletRes, hubRes, linkRes] = await Promise.all([
      supabase.from("representatives").select("*").order("name"),
      supabase.from("delivery_blocks").select("id, hub_id, name").eq("is_active", true),
      supabase.from("outlets").select("id, name").order("name"),
      supabase.from("delivery_hubs").select("id, name"),
      supabase.from("outlet_hub_links").select("*"),
    ]);
    if (repRes.data) setReps(repRes.data as Rep[]);
    if (blockRes.data) setBlocks(blockRes.data as Block[]);
    if (outletRes.data) setOutlets(outletRes.data as Outlet[]);
    if (hubRes.data) setHubs(hubRes.data as Hub[]);
    if (linkRes.data) setOutletHubLinks(linkRes.data as OutletHubLink[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function getBlocksForOutlet(outletId: string) {
    const hubIds = outletHubLinks.filter(l => l.outlet_id === outletId).map(l => l.hub_id);
    return blocks.filter(b => hubIds.includes(b.hub_id));
  }

  function openModal(rep?: Rep) {
    if (rep) {
      setEditingRep(rep);
      setForm({
        name: rep.name,
        email: "",
        password: "",
        phone: rep.phone || "",
        outlet_id: rep.outlet_id,
        block_id: rep.block_id,
        commission_type: rep.commission_type,
        commission_value: String(rep.commission_value),
      });
    } else {
      setEditingRep(null);
      setForm(EMPTY_FORM);
    }
    setModalOpen(true);
  }

  async function saveRep() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.outlet_id) { toast.error("Select an outlet"); return; }
    if (!form.block_id) { toast.error("Select a block"); return; }

    setSaving(true);

    if (editingRep) {
      const { error } = await supabase.from("representatives").update({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        outlet_id: form.outlet_id,
        block_id: form.block_id,
        commission_type: form.commission_type,
        commission_value: parseFloat(form.commission_value) || 0,
      }).eq("id", editingRep.id);
      if (error) toast.error(error.message);
      else toast.success("Rep updated");
    } else {
      if (!form.email.trim() || !form.password.trim()) {
        toast.error("Email and password required for new rep");
        setSaving(false);
        return;
      }

      // Create auth user via admin API
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          full_name: form.name.trim(),
          role: "representative",
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to create user");
        setSaving(false);
        return;
      }

      // Create representative record
      const { error } = await supabase.from("representatives").insert({
        user_id: result.user.id,
        outlet_id: form.outlet_id,
        block_id: form.block_id,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        commission_type: form.commission_type,
        commission_value: parseFloat(form.commission_value) || 0,
      } as never);
      if (error) toast.error(error.message);
      else toast.success("Representative created");
    }

    setSaving(false);
    setModalOpen(false);
    fetchAll();
  }

  async function toggleRep(rep: Rep) {
    const { error } = await supabase.from("representatives")
      .update({ is_active: !rep.is_active })
      .eq("id", rep.id);
    if (error) toast.error(error.message);
    else fetchAll();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Representatives</h1>
          <p className="text-sm text-gray-500 mt-1">Manage block delivery representatives</p>
        </div>
        <Button onClick={() => openModal()} className="gap-2">
          <Plus size={16} /> Add Rep
        </Button>
      </div>

      {reps.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <UserCheck size={48} className="mx-auto mb-3 opacity-50" />
          <p>No representatives yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {reps.map(rep => {
            const outlet = outlets.find(o => o.id === rep.outlet_id);
            const block = blocks.find(b => b.id === rep.block_id);
            const hub = block ? hubs.find(h => h.id === block.hub_id) : null;
            return (
              <div key={rep.id} className="border border-gray-200 rounded-xl bg-white p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  rep.is_active ? "bg-brand-green" : "bg-gray-300"
                }`}>
                  {rep.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{rep.name}</span>
                    <Badge variant={rep.is_active ? "success" : "default"}>
                      {rep.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {rep.phone && <span className="flex items-center gap-1"><Phone size={10} />{rep.phone}</span>}
                    <span className="flex items-center gap-1"><Building2 size={10} />{outlet?.name || "—"}</span>
                    <span className="flex items-center gap-1"><MapPin size={10} />{block?.name || "—"}{hub ? ` (${hub.name})` : ""}</span>
                    <span className="flex items-center gap-1">
                      <IndianRupee size={10} />
                      {rep.commission_type === "flat_per_order" && `₹${rep.commission_value}/order`}
                      {rep.commission_type === "percentage" && `${rep.commission_value}%`}
                      {rep.commission_type === "flat_per_batch" && `₹${rep.commission_value}/batch`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleRep(rep)}
                    className={`p-2 rounded-lg ${rep.is_active ? "hover:bg-red-50 text-red-500" : "hover:bg-green-50 text-green-600"}`}
                    title={rep.is_active ? "Deactivate" : "Activate"}>
                    {rep.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                  </button>
                  <button onClick={() => openModal(rep)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Edit">
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Rep Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingRep ? "Edit Representative" : "Add Representative"}>
        <div className="space-y-4">
          <Input label="Full Name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

          {!editingRep && (
            <>
              <Input label="Email" type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              <Input label="Password" type="password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </>
          )}

          <Input label="Phone (optional)" value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
            <select value={form.outlet_id}
              onChange={e => {
                const outletId = e.target.value;
                const available = getBlocksForOutlet(outletId);
                setForm(f => ({ ...f, outlet_id: outletId, block_id: available[0]?.id || "" }));
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
              <option value="">Select outlet...</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {form.outlet_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Block</label>
              <select value={form.block_id}
                onChange={e => setForm(f => ({ ...f, block_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
                <option value="">Select block...</option>
                {getBlocksForOutlet(form.outlet_id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commission Type</label>
              <select value={form.commission_type}
                onChange={e => setForm(f => ({ ...f, commission_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
                <option value="flat_per_order">Flat per Order</option>
                <option value="percentage">Percentage</option>
                <option value="flat_per_batch">Flat per Batch</option>
              </select>
            </div>
            <Input label={form.commission_type === "percentage" ? "Percentage (%)" : "Amount (₹)"}
              type="number" value={form.commission_value}
              onChange={e => setForm(f => ({ ...f, commission_value: e.target.value }))} />
          </div>

          <Button onClick={saveRep} disabled={saving} className="w-full">
            {saving ? "Saving..." : editingRep ? "Update Rep" : "Create Rep"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
