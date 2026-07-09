"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Outlet, Profile } from "@/lib/supabase/types";
import { cn, slugify } from "@/lib/utils/helpers";
import { Button, Input, Modal, Badge, Spinner, ImageUpload } from "@/components/ui";
import {
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  ToggleLeft,
  ToggleRight,
  Building2,
  Users,
  ShoppingBag,
  ExternalLink,
  UserPlus,
  DoorOpen,
  DoorClosed,
} from "lucide-react";
import toast from "react-hot-toast";

type OutletForm = {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  latitude: string;
  longitude: string;
  opens_at: string;
  closes_at: string;
  image_url: string;
  is_active: boolean;
};

const EMPTY_FORM: OutletForm = {
  name: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  phone: "",
  latitude: "",
  longitude: "",
  opens_at: "09:00",
  closes_at: "22:00",
  image_url: "",
  is_active: true,
};

type StaffMember = Profile & { is_manager?: boolean };

function isOutletOpen(outlet: Outlet): boolean {
  return outlet.is_active && !outlet.is_manually_closed;
}

export default function AdminOutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [form, setForm] = useState<OutletForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Outlet | null>(null);
  const supabase = createClient();

  // Staff management
  const [staffModalOutlet, setStaffModalOutlet] = useState<Outlet | null>(null);
  const [outletStaff, setOutletStaff] = useState<StaffMember[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  // Manual close/open
  const [manualCloseOutlet, setManualCloseOutlet] = useState<Outlet | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [closeSaving, setCloseSaving] = useState(false);

  // Menu counts per outlet
  const [menuCounts, setMenuCounts] = useState<Record<string, number>>({});

  // Order counts per outlet
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});

  const fetchOutlets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("outlets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setOutlets((data as Outlet[] | null) ?? []);

      // Fetch menu item counts per outlet
      const { data: menuData } = await supabase
        .from("outlet_menu_items")
        .select("outlet_id, item_id");
      if (menuData) {
        const counts: Record<string, number> = {};
        for (const row of menuData as { outlet_id: string; item_id: string }[]) {
          counts[row.outlet_id] = (counts[row.outlet_id] || 0) + 1;
        }
        setMenuCounts(counts);
      }

      // Fetch order counts per outlet
      const { data: orderData } = await supabase
        .from("orders")
        .select("outlet_id");
      if (orderData) {
        const counts: Record<string, number> = {};
        for (const row of orderData as { outlet_id: string }[]) {
          counts[row.outlet_id] = (counts[row.outlet_id] || 0) + 1;
        }
        setOrderCounts(counts);
      }
    } catch (err) {
      console.error("Failed to fetch outlets:", err);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchOutlets();
  }, [fetchOutlets]);

  const openAdd = () => {
    setEditingOutlet(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (outlet: Outlet) => {
    setEditingOutlet(outlet);
    setForm({
      name: outlet.name,
      address: outlet.address,
      city: outlet.city,
      state: outlet.state,
      pincode: outlet.pincode,
      phone: outlet.phone,
      latitude: String(outlet.latitude),
      longitude: String(outlet.longitude),
      opens_at: outlet.opens_at,
      closes_at: outlet.closes_at,
      image_url: outlet.image_url ?? "",
      is_active: outlet.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.address || !form.city) return;
    setSaving(true);

    const payload = {
      name: form.name,
      slug: slugify(form.name),
      address: form.address,
      city: form.city,
      state: form.state,
      pincode: form.pincode,
      phone: form.phone,
      latitude: parseFloat(form.latitude) || 0,
      longitude: parseFloat(form.longitude) || 0,
      opens_at: form.opens_at,
      closes_at: form.closes_at,
      image_url: form.image_url || null,
      is_active: form.is_active,
    };

    try {
      if (editingOutlet) {
        const { error } = await supabase
          .from("outlets")
          .update(payload as never)
          .eq("id", editingOutlet.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("outlets").insert(payload as never);
        if (error) throw error;
      }
    } catch (err) {
      console.error("[admin/outlets] Save failed:", err);
      toast.error("Could not save outlet");
      setSaving(false);
      return;
    }

    setSaving(false);
    setModalOpen(false);
    fetchOutlets();
  };

  const handleDelete = async (outlet: Outlet) => {
    try {
      const { error } = await supabase.from("outlets").delete().eq("id", outlet.id);
      if (error) throw error;
    } catch (err) {
      console.error("[admin/outlets] Delete failed:", err);
      toast.error("Could not delete outlet");
      setDeleteConfirm(null);
      return;
    }
    setDeleteConfirm(null);
    fetchOutlets();
  };

  const toggleActive = async (outlet: Outlet) => {
    try {
      const { error } = await supabase
        .from("outlets")
        .update({ is_active: !outlet.is_active } as never)
        .eq("id", outlet.id);
      if (error) throw error;
    } catch (err) {
      console.error("[admin/outlets] Toggle active failed:", err);
      toast.error("Could not update outlet");
      return;
    }
    setOutlets((prev) =>
      prev.map((o) => (o.id === outlet.id ? { ...o, is_active: !o.is_active } : o))
    );
  };

  // Manual close/open toggle
  const handleManualClose = async () => {
    if (!manualCloseOutlet) return;
    setCloseSaving(true);
    const isClosing = !manualCloseOutlet.is_manually_closed;
    const payload = {
      is_manually_closed: isClosing,
      manual_close_reason: isClosing ? closeReason || null : null,
    };
    try {
      const { error } = await supabase
        .from("outlets")
        .update(payload as never)
        .eq("id", manualCloseOutlet.id);
      if (error) throw error;
    } catch (err) {
      console.error("[admin/outlets] Manual close update failed:", err);
      toast.error("Could not update outlet");
      setCloseSaving(false);
      return;
    }
    setOutlets((prev) =>
      prev.map((o) =>
        o.id === manualCloseOutlet.id ? { ...o, ...payload } : o
      )
    );
    setCloseSaving(false);
    setManualCloseOutlet(null);
    setCloseReason("");
  };

  // Staff management
  const openStaffModal = async (outlet: Outlet) => {
    setStaffModalOutlet(outlet);
    setStaffLoading(true);
    try {
      const { data: staffData, error: staffError } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "outlet_staff");
      if (staffError) throw staffError;

      const { data: assignmentData, error: assignmentError } = await supabase
        .from("outlet_staff" as never)
        .select("user_id,is_manager")
        .eq("outlet_id" as never, outlet.id as never);
      if (assignmentError) throw assignmentError;

      const assignments = (assignmentData as { user_id: string; is_manager: boolean }[] | null) ?? [];
      const assignmentMap = new Map(assignments.map((a) => [a.user_id, a.is_manager]));
      const staffProfiles = ((staffData as Profile[] | null) ?? []) as StaffMember[];

      setAllStaff(staffProfiles);
      setOutletStaff(
        staffProfiles
          .filter((staff) => assignmentMap.has(staff.id))
          .map((staff) => ({ ...staff, is_manager: assignmentMap.get(staff.id) ?? false }))
      );
    } catch (err) {
      console.error("[admin/outlets] Staff fetch failed:", err);
      toast.error("Could not load staff assignments");
      setAllStaff([]);
      setOutletStaff([]);
    }
    setStaffLoading(false);
  };

  const assignStaff = async (staff: StaffMember) => {
    if (!staffModalOutlet) return;
    try {
      const { error } = await supabase.from("outlet_staff" as never).insert({
        outlet_id: staffModalOutlet.id,
        user_id: staff.id,
        is_manager: false,
      } as never);
      if (error) throw error;
      setOutletStaff((prev) => [...prev, { ...staff, is_manager: false }]);
      toast.success("Staff assigned");
    } catch (err) {
      console.error("[admin/outlets] Staff assignment failed:", err);
      toast.error("Could not assign staff");
    }
  };

  const removeStaff = async (staff: StaffMember) => {
    if (!staffModalOutlet) return;
    try {
      const { error } = await supabase
        .from("outlet_staff" as never)
        .delete()
        .eq("outlet_id" as never, staffModalOutlet.id as never)
        .eq("user_id" as never, staff.id as never);
      if (error) throw error;
      setOutletStaff((prev) => prev.filter((s) => s.id !== staff.id));
      toast.success("Staff removed");
    } catch (err) {
      console.error("[admin/outlets] Staff removal failed:", err);
      toast.error("Could not remove staff");
    }
  };

  const toggleStaffManager = async (staff: StaffMember) => {
    if (!staffModalOutlet) return;
    const next = !staff.is_manager;
    try {
      const { error } = await supabase
        .from("outlet_staff" as never)
        .update({ is_manager: next } as never)
        .eq("outlet_id" as never, staffModalOutlet.id as never)
        .eq("user_id" as never, staff.id as never);
      if (error) throw error;
      setOutletStaff((prev) =>
        prev.map((s) => (s.id === staff.id ? { ...s, is_manager: next } : s))
      );
      toast.success(next ? "Manager access granted" : "Manager access removed");
    } catch (err) {
      console.error("[admin/outlets] Manager toggle failed:", err);
      toast.error("Could not update staff access");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-gray-500">
          {outlets.length} outlet{outlets.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4" />
          Add Outlet
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* Outlets Grid */}
      {!loading && outlets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
          <Building2 className="w-12 h-12 mb-3" />
          <p className="text-base font-semibold">No outlets yet</p>
          <p className="text-sm mt-1">Add your first outlet to get started</p>
        </div>
      )}

      {!loading && outlets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {outlets.map((outlet) => {
            const open = isOutletOpen(outlet);
            return (
              <div
                key={outlet.id}
                className="bg-white rounded-xl shadow-sm border border-brand-gray-100 p-5 flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-lg font-[family-name:var(--font-heading)] text-brand-black">
                      {outlet.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-brand-gray-500">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{outlet.address}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleActive(outlet)}
                    title={outlet.is_active ? "Active" : "Inactive"}
                  >
                    {outlet.is_active ? (
                      <ToggleRight className="w-7 h-7 text-brand-green" />
                    ) : (
                      <ToggleLeft className="w-7 h-7 text-brand-gray-300" />
                    )}
                  </button>
                </div>

                {/* Details */}
                <div className="flex flex-col gap-1.5 text-sm text-brand-gray-600">
                  <span>
                    {outlet.city}, {outlet.state} - {outlet.pincode}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {outlet.phone}
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-brand-gray-500">
                  <span className="flex items-center gap-1">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    {orderCounts[outlet.id] ?? 0} orders
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {menuCounts[outlet.id] ?? 0} menu items
                  </span>
                </div>

                {/* Manual Close/Open Button */}
                {outlet.is_active && (
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        setManualCloseOutlet(outlet);
                        setCloseReason(outlet.manual_close_reason ?? "");
                      }}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors",
                        outlet.is_manually_closed
                          ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                          : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                      )}
                    >
                      {outlet.is_manually_closed ? (
                        <>
                          <DoorOpen className="w-4 h-4" />
                          Reopen Outlet
                        </>
                      ) : (
                        <>
                          <DoorClosed className="w-4 h-4" />
                          Close Outlet
                        </>
                      )}
                    </button>
                    {outlet.is_manually_closed && outlet.manual_close_reason && (
                      <p className="text-xs text-red-500 mt-1.5 text-center italic">
                        {outlet.manual_close_reason}
                      </p>
                    )}
                  </div>
                )}

                {/* Status + Actions */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-brand-gray-100">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold px-2.5 py-1 rounded-full",
                        open
                          ? "bg-green-100 text-brand-green-dark"
                          : "bg-red-100 text-red-600"
                      )}
                    >
                      {open ? "Open Now" : "Closed"}
                    </span>
                    {outlet.is_manually_closed && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                        Manually Closed
                      </span>
                    )}
                    {!outlet.is_active && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-gray-100 text-brand-gray-500">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openStaffModal(outlet)}
                      className="p-1.5 rounded-lg hover:bg-brand-gray-100 text-brand-gray-500 transition-colors"
                      title="Manage Staff"
                    >
                      <Users className="w-4 h-4" />
                    </button>
                    <a
                      href={`/admin/orders?outlet=${outlet.id}`}
                      className="p-1.5 rounded-lg hover:bg-brand-gray-100 text-brand-gray-500 transition-colors"
                      title="View Orders"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => openEdit(outlet)}
                      className="p-1.5 rounded-lg hover:bg-brand-gray-100 text-brand-gray-500 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(outlet)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-brand-gray-400 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingOutlet ? "Edit Outlet" : "Add Outlet"}
        className="max-w-lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Koramangala Store"
          />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Full address"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="City"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <Input
              label="State"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Pincode"
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Latitude"
              type="number"
              step="any"
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: e.target.value })}
            />
            <Input
              label="Longitude"
              type="number"
              step="any"
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-brand-gray-700 mb-1.5 block">Outlet Image</label>
            <ImageUpload
              value={form.image_url || null}
              onChange={(url) => setForm({ ...form, image_url: url ?? "" })}
              folder="outlets"
              aspect="landscape"
              placeholder="Upload outlet photo"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow"
            />
            <span className="text-sm font-medium text-brand-gray-700">Active</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>
            {editingOutlet ? "Update" : "Add Outlet"}
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Outlet"
        className="max-w-sm"
      >
        <p className="text-sm text-brand-gray-600">
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            size="sm"
            className="bg-red-500 hover:bg-red-600 text-white"
            onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Manual Close/Open Modal */}
      <Modal
        open={!!manualCloseOutlet}
        onClose={() => { setManualCloseOutlet(null); setCloseReason(""); }}
        title={manualCloseOutlet?.is_manually_closed ? "Reopen Outlet" : "Close Outlet"}
        className="max-w-sm"
      >
        {manualCloseOutlet && (
          <>
            {manualCloseOutlet.is_manually_closed ? (
              <p className="text-sm text-brand-gray-600">
                Reopen <strong>{manualCloseOutlet.name}</strong>? It will resume accepting orders based on its scheduled hours.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-brand-gray-600">
                  Close <strong>{manualCloseOutlet.name}</strong> immediately? It will stop accepting new orders until reopened.
                </p>
                <Input
                  label="Reason (optional)"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="e.g. Staff shortage, maintenance, weather"
                />
              </div>
            )}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
              <Button variant="ghost" size="sm" onClick={() => { setManualCloseOutlet(null); setCloseReason(""); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={closeSaving}
                className={manualCloseOutlet.is_manually_closed
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-500 hover:bg-red-600 text-white"
                }
                onClick={handleManualClose}
              >
                {manualCloseOutlet.is_manually_closed ? "Reopen" : "Close Outlet"}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Staff Management Modal */}
      <Modal
        open={!!staffModalOutlet}
        onClose={() => setStaffModalOutlet(null)}
        title={`Staff: ${staffModalOutlet?.name ?? ""}`}
        className="max-w-lg"
      >
        {staffLoading ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm text-brand-gray-500">
                {outletStaff.length} staff member{outletStaff.length !== 1 ? "s" : ""}
              </p>
              <a
                href="/admin/customers"
                className="text-xs font-semibold text-brand-yellow-dark hover:underline flex items-center gap-1"
              >
                <UserPlus className="w-3 h-3" />
                Create Staff Account
              </a>
            </div>

            {outletStaff.length === 0 ? (
              <div className="text-center py-8 text-brand-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm font-semibold">No staff assigned</p>
                <p className="text-xs mt-1">
                  Create staff accounts in the Customers page and assign them here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-brand-gray-100">
                {outletStaff.map((staff) => (
                  <div key={staff.id} className="flex items-center gap-3 py-3">
                    <div className="w-9 h-9 rounded-full bg-brand-yellow/20 flex items-center justify-center shrink-0">
                      <span className="font-bold text-brand-yellow-dark text-xs">
                        {(staff.full_name ?? "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-black truncate">
                        {staff.full_name ?? "Unnamed"}
                      </p>
                      <p className="text-xs text-brand-gray-500">
                        {staff.email ?? staff.phone ?? "No contact"}
                      </p>
                    </div>
                    <Badge variant={staff.is_manager ? "warning" : "info"}>
                      {staff.is_manager ? "Manager" : "Staff"}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => toggleStaffManager(staff)}>
                      {staff.is_manager ? "Demote" : "Manager"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeStaff(staff)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Available staff to assign */}
            {allStaff.filter((staff) => !outletStaff.some((assigned) => assigned.id === staff.id)).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-brand-gray-500 uppercase tracking-wider mb-2">
                  Available Staff
                </p>
                <div className="bg-brand-gray-50 rounded-lg p-3 space-y-2">
                  {allStaff
                    .filter((staff) => !outletStaff.some((assigned) => assigned.id === staff.id))
                    .map((staff) => (
                    <div key={staff.id} className="flex items-center justify-between text-sm">
                      <span className="text-brand-gray-700">
                        {staff.full_name ?? "Unnamed"} ({staff.email ?? staff.phone})
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => assignStaff(staff)}>
                        <Plus className="w-3 h-3" />
                        Assign
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
