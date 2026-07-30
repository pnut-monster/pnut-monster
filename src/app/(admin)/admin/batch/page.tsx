/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Modal, Badge, Spinner } from "@/components/ui";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  MapPin,
  Layers,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Link2,
} from "lucide-react";
import toast from "react-hot-toast";

type Hub = {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

type Block = {
  id: string;
  hub_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
};

type SubLocation = {
  id: string;
  block_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
};

type Outlet = {
  id: string;
  name: string;
};

type OutletHubLink = {
  outlet_id: string;
  hub_id: string;
};

export default function AdminBatchPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [subLocations, setSubLocations] = useState<SubLocation[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletHubLinks, setOutletHubLinks] = useState<OutletHubLink[]>([]);

  // Expanded state
  const [expandedHubs, setExpandedHubs] = useState<Set<string>>(new Set());
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  // Hub modal
  const [hubModalOpen, setHubModalOpen] = useState(false);
  const [editingHub, setEditingHub] = useState<Hub | null>(null);
  const [hubForm, setHubForm] = useState({ name: "", address: "" });
  const [saving, setSaving] = useState(false);

  // Block modal
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [blockForm, setBlockForm] = useState({ name: "", hub_id: "" });

  // Sub-location modal
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubLocation | null>(null);
  const [subForm, setSubForm] = useState({ name: "", block_id: "" });

  // Link outlet modal
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkHubId, setLinkHubId] = useState("");
  const [linkOutletId, setLinkOutletId] = useState("");

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [hubRes, blockRes, subRes, outletRes, linkRes] = await Promise.all([
      supabase.from("delivery_hubs").select("*").order("name"),
      supabase.from("delivery_blocks").select("*").order("display_order"),
      supabase.from("delivery_sub_locations").select("*").order("display_order"),
      supabase.from("outlets").select("id, name").order("name"),
      supabase.from("outlet_hub_links").select("*"),
    ]);
    if (hubRes.data) setHubs(hubRes.data as Hub[]);
    if (blockRes.data) setBlocks(blockRes.data as Block[]);
    if (subRes.data) setSubLocations(subRes.data as SubLocation[]);
    if (outletRes.data) setOutlets(outletRes.data as Outlet[]);
    if (linkRes.data) setOutletHubLinks(linkRes.data as OutletHubLink[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Hub CRUD ──
  function openHubModal(hub?: Hub) {
    setEditingHub(hub || null);
    setHubForm({ name: hub?.name || "", address: hub?.address || "" });
    setHubModalOpen(true);
  }

  async function saveHub() {
    if (!hubForm.name.trim()) { toast.error("Hub name is required"); return; }
    setSaving(true);
    if (editingHub) {
      const { error } = await supabase.from("delivery_hubs").update({
        name: hubForm.name.trim(),
        address: hubForm.address.trim() || null,
      }).eq("id", editingHub.id);
      if (error) toast.error(error.message);
      else toast.success("Hub updated");
    } else {
      const { error } = await supabase.from("delivery_hubs").insert({
        name: hubForm.name.trim(),
        address: hubForm.address.trim() || null,
      } as never);
      if (error) toast.error(error.message);
      else toast.success("Hub created");
    }
    setSaving(false);
    setHubModalOpen(false);
    fetchAll();
  }

  async function toggleHub(hub: Hub) {
    const { error } = await supabase.from("delivery_hubs").update({ is_active: !hub.is_active }).eq("id", hub.id);
    if (error) toast.error(error.message);
    else fetchAll();
  }

  // ── Block CRUD ──
  function openBlockModal(hubId: string, block?: Block) {
    setEditingBlock(block || null);
    setBlockForm({ name: block?.name || "", hub_id: hubId });
    setBlockModalOpen(true);
  }

  async function saveBlock() {
    if (!blockForm.name.trim()) { toast.error("Block name is required"); return; }
    setSaving(true);
    if (editingBlock) {
      const { error } = await supabase.from("delivery_blocks").update({
        name: blockForm.name.trim(),
      }).eq("id", editingBlock.id);
      if (error) toast.error(error.message);
      else toast.success("Block updated");
    } else {
      const maxOrder = blocks.filter(b => b.hub_id === blockForm.hub_id).length;
      const { error } = await supabase.from("delivery_blocks").insert({
        name: blockForm.name.trim(),
        hub_id: blockForm.hub_id,
        display_order: maxOrder,
      } as never);
      if (error) toast.error(error.message);
      else toast.success("Block created");
    }
    setSaving(false);
    setBlockModalOpen(false);
    fetchAll();
  }

  async function toggleBlock(block: Block) {
    const { error } = await supabase.from("delivery_blocks").update({ is_active: !block.is_active }).eq("id", block.id);
    if (error) toast.error(error.message);
    else fetchAll();
  }

  // ── Sub-location CRUD ──
  function openSubModal(blockId: string, sub?: SubLocation) {
    setEditingSub(sub || null);
    setSubForm({ name: sub?.name || "", block_id: blockId });
    setSubModalOpen(true);
  }

  async function saveSub() {
    if (!subForm.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    if (editingSub) {
      const { error } = await supabase.from("delivery_sub_locations").update({
        name: subForm.name.trim(),
      }).eq("id", editingSub.id);
      if (error) toast.error(error.message);
      else toast.success("Sub-location updated");
    } else {
      const maxOrder = subLocations.filter(s => s.block_id === subForm.block_id).length;
      const { error } = await supabase.from("delivery_sub_locations").insert({
        name: subForm.name.trim(),
        block_id: subForm.block_id,
        display_order: maxOrder,
      } as never);
      if (error) toast.error(error.message);
      else toast.success("Sub-location created");
    }
    setSaving(false);
    setSubModalOpen(false);
    fetchAll();
  }

  async function toggleSub(sub: SubLocation) {
    const { error } = await supabase.from("delivery_sub_locations").update({ is_active: !sub.is_active }).eq("id", sub.id);
    if (error) toast.error(error.message);
    else fetchAll();
  }

  // ── Outlet Link ──
  async function linkOutlet() {
    if (!linkHubId || !linkOutletId) { toast.error("Select both hub and outlet"); return; }
    setSaving(true);
    const { error } = await supabase.from("outlet_hub_links").insert({
      outlet_id: linkOutletId,
      hub_id: linkHubId,
    } as never);
    if (error) {
      if (error.code === "23505") toast.error("This outlet is already linked to this hub");
      else toast.error(error.message);
    } else {
      toast.success("Outlet linked to hub");
    }
    setSaving(false);
    setLinkModalOpen(false);
    fetchAll();
  }

  async function unlinkOutlet(outletId: string, hubId: string) {
    const { error } = await supabase.from("outlet_hub_links")
      .delete()
      .eq("outlet_id", outletId)
      .eq("hub_id", hubId);
    if (error) toast.error(error.message);
    else { toast.success("Outlet unlinked"); fetchAll(); }
  }

  // ── Delete ──
  async function confirmDelete() {
    if (!deleteConfirm) return;
    setSaving(true);
    const table = deleteConfirm.type === "hub" ? "delivery_hubs"
      : deleteConfirm.type === "block" ? "delivery_blocks"
      : "delivery_sub_locations";
    const { error } = await supabase.from(table).delete().eq("id", deleteConfirm.id);
    if (error) toast.error(error.message);
    else toast.success(`${deleteConfirm.name} deleted`);
    setSaving(false);
    setDeleteConfirm(null);
    fetchAll();
  }

  function toggleExpanded(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch System — Locations</h1>
          <p className="text-sm text-gray-500 mt-1">Manage hubs, blocks, and sub-locations for batch delivery</p>
        </div>
        <Button onClick={() => openHubModal()} className="gap-2">
          <Plus size={16} /> Add Hub
        </Button>
      </div>

      {hubs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={48} className="mx-auto mb-3 opacity-50" />
          <p>No delivery hubs yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {hubs.map(hub => {
            const hubBlocks = blocks.filter(b => b.hub_id === hub.id);
            const linkedOutlets = outletHubLinks
              .filter(l => l.hub_id === hub.id)
              .map(l => outlets.find(o => o.id === l.outlet_id))
              .filter(Boolean) as Outlet[];
            const isExpanded = expandedHubs.has(hub.id);

            return (
              <div key={hub.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
                {/* Hub Header */}
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpanded(expandedHubs, hub.id, setExpandedHubs)}>
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <Building2 size={20} className="text-brand-green" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{hub.name}</span>
                      <Badge variant={hub.is_active ? "success" : "neutral"}>
                        {hub.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {hub.address && <p className="text-xs text-gray-500 truncate">{hub.address}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {hubBlocks.length} block{hubBlocks.length !== 1 ? "s" : ""} · {linkedOutlets.length} outlet{linkedOutlets.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setLinkHubId(hub.id); setLinkOutletId(""); setLinkModalOpen(true); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Link outlet">
                      <Link2 size={16} />
                    </button>
                    <button onClick={() => toggleHub(hub)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Toggle active">
                      <GripVertical size={16} />
                    </button>
                    <button onClick={() => openHubModal(hub)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setDeleteConfirm({ type: "hub", id: hub.id, name: hub.name })}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Expanded: Blocks + Linked Outlets */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    {/* Linked Outlets */}
                    {linkedOutlets.length > 0 && (
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-xs font-medium text-gray-500 mb-1">Linked Outlets</p>
                        <div className="flex flex-wrap gap-2">
                          {linkedOutlets.map(outlet => (
                            <span key={outlet.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-md text-xs">
                              {outlet.name}
                              <button onClick={() => unlinkOutlet(outlet.id, hub.id)} className="text-red-400 hover:text-red-600">
                                <Trash2 size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Blocks */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Blocks</p>
                        <button onClick={() => openBlockModal(hub.id)}
                          className="text-xs text-brand-green hover:underline flex items-center gap-1">
                          <Plus size={12} /> Add Block
                        </button>
                      </div>

                      {hubBlocks.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No blocks yet</p>
                      ) : (
                        hubBlocks.map(block => {
                          const blockSubs = subLocations.filter(s => s.block_id === block.id);
                          const blockExpanded = expandedBlocks.has(block.id);
                          return (
                            <div key={block.id} className="bg-white border border-gray-200 rounded-lg">
                              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                                onClick={() => toggleExpanded(expandedBlocks, block.id, setExpandedBlocks)}>
                                {blockExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <MapPin size={14} className="text-gray-400" />
                                <span className="flex-1 text-sm font-medium">{block.name}</span>
                                <Badge variant={block.is_active ? "success" : "neutral"} className="text-[10px] px-1.5">
                                  {block.is_active ? "Active" : "Off"}
                                </Badge>
                                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => toggleBlock(block)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                                    <GripVertical size={14} />
                                  </button>
                                  <button onClick={() => openBlockModal(hub.id, block)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => setDeleteConfirm({ type: "block", id: block.id, name: block.name })} className="p-1 rounded hover:bg-red-50 text-red-400">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              {blockExpanded && (
                                <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/30">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[10px] font-medium text-gray-400 uppercase">Sub-locations</p>
                                    <button onClick={() => openSubModal(block.id)}
                                      className="text-[10px] text-brand-green hover:underline flex items-center gap-0.5">
                                      <Plus size={10} /> Add
                                    </button>
                                  </div>
                                  {blockSubs.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">None</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {blockSubs.map(sub => (
                                        <div key={sub.id} className="flex items-center gap-2 text-xs py-0.5">
                                          <Layers size={12} className="text-gray-300" />
                                          <span className="flex-1">{sub.name}</span>
                                          <Badge variant={sub.is_active ? "success" : "neutral"} className="text-[9px] px-1">
                                            {sub.is_active ? "On" : "Off"}
                                          </Badge>
                                          <button onClick={() => toggleSub(sub)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                                            <GripVertical size={12} />
                                          </button>
                                          <button onClick={() => openSubModal(block.id, sub)} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                                            <Pencil size={12} />
                                          </button>
                                          <button onClick={() => setDeleteConfirm({ type: "sub", id: sub.id, name: sub.name })} className="p-0.5 rounded hover:bg-red-50 text-red-400">
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hub Modal */}
      <Modal isOpen={hubModalOpen} onClose={() => setHubModalOpen(false)} title={editingHub ? "Edit Hub" : "Create Hub"}>
        <div className="space-y-4">
          <Input label="Hub Name" placeholder="e.g. Chandigarh University" value={hubForm.name}
            onChange={e => setHubForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Address (optional)" placeholder="Full address" value={hubForm.address}
            onChange={e => setHubForm(f => ({ ...f, address: e.target.value }))} />
          <Button onClick={saveHub} disabled={saving} className="w-full">
            {saving ? "Saving..." : editingHub ? "Update Hub" : "Create Hub"}
          </Button>
        </div>
      </Modal>

      {/* Block Modal */}
      <Modal isOpen={blockModalOpen} onClose={() => setBlockModalOpen(false)} title={editingBlock ? "Edit Block" : "Add Block"}>
        <div className="space-y-4">
          <Input label="Block Name" placeholder="e.g. Engineering Building" value={blockForm.name}
            onChange={e => setBlockForm(f => ({ ...f, name: e.target.value }))} />
          <Button onClick={saveBlock} disabled={saving} className="w-full">
            {saving ? "Saving..." : editingBlock ? "Update Block" : "Add Block"}
          </Button>
        </div>
      </Modal>

      {/* Sub-location Modal */}
      <Modal isOpen={subModalOpen} onClose={() => setSubModalOpen(false)} title={editingSub ? "Edit Sub-location" : "Add Sub-location"}>
        <div className="space-y-4">
          <Input label="Sub-location Name" placeholder="e.g. Floor 2, Room 205" value={subForm.name}
            onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))} />
          <Button onClick={saveSub} disabled={saving} className="w-full">
            {saving ? "Saving..." : editingSub ? "Update" : "Add Sub-location"}
          </Button>
        </div>
      </Modal>

      {/* Link Outlet Modal */}
      <Modal isOpen={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="Link Outlet to Hub">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
            <select value={linkOutletId} onChange={e => setLinkOutletId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green">
              <option value="">Select outlet...</option>
              {outlets
                .filter(o => !outletHubLinks.some(l => l.outlet_id === o.id && l.hub_id === linkHubId))
                .map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <Button onClick={linkOutlet} disabled={saving || !linkOutletId} className="w-full">
            {saving ? "Linking..." : "Link Outlet"}
          </Button>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
            {deleteConfirm?.type === "hub" && " This will also delete all blocks and sub-locations within it."}
            {deleteConfirm?.type === "block" && " This will also delete all sub-locations within it."}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1">Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} disabled={saving} className="flex-1">
              {saving ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
