"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Pencil, Plus, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button, Input, Modal, Spinner } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime } from "@/lib/utils/helpers";
import type { Notification, Profile } from "@/lib/supabase/types";

type NotificationType = Notification["type"];

type NotificationRow = Notification & {
  profiles?: Pick<Profile, "full_name" | "email" | "phone"> | null;
};

type NotificationForm = {
  target: "all" | "single";
  user_id: string;
  title: string;
  body: string;
  type: NotificationType;
};

const EMPTY_FORM: NotificationForm = {
  target: "single",
  user_id: "",
  title: "",
  body: "",
  type: "general",
};

const TYPE_OPTIONS: { value: NotificationType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "order", label: "Order" },
  { value: "wallet", label: "Wallet" },
  { value: "loyalty", label: "Loyalty" },
  { value: "campaign", label: "Campaign" },
];

const TYPE_STYLES: Record<NotificationType, string> = {
  general: "bg-brand-gray-100 text-brand-gray-700",
  order: "bg-blue-100 text-blue-700",
  wallet: "bg-green-100 text-green-700",
  loyalty: "bg-yellow-100 text-yellow-700",
  campaign: "bg-purple-100 text-purple-700",
};

export default function AdminNotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRow | null>(null);
  const [form, setForm] = useState<NotificationForm>(EMPTY_FORM);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [notificationsRes, customersRes] = await Promise.all([
        supabase
          .from("notifications")
          .select("*, profiles!notifications_user_id_fkey(full_name, email, phone)")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("profiles")
          .select("*")
          .eq("role", "customer")
          .order("full_name", { ascending: true }),
      ]);

      if (notificationsRes.error) throw notificationsRes.error;
      if (customersRes.error) throw customersRes.error;

      setNotifications((notificationsRes.data as NotificationRow[] | null) ?? []);
      setCustomers((customersRes.data as Profile[] | null) ?? []);
    } catch (err) {
      console.error("[admin/notifications] Failed to load:", err);
      toast.error("Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q) ||
      (n.profiles?.full_name ?? "").toLowerCase().includes(q) ||
      (n.profiles?.email ?? "").toLowerCase().includes(q) ||
      (n.profiles?.phone ?? "").includes(q)
    );
  }, [notifications, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      user_id: customers[0]?.id ?? "",
    });
    setModalOpen(true);
  };

  const openEdit = (notification: NotificationRow) => {
    setEditing(notification);
    setForm({
      target: "single",
      user_id: notification.user_id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (!editing && form.target === "single" && !form.user_id) {
      toast.error("Select a customer");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("notifications")
          .update({
            title: form.title.trim(),
            body: form.body.trim(),
            type: form.type,
          } as never)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Notification updated");
      } else if (form.target === "all") {
        if (customers.length === 0) {
          toast.error("No customers to notify");
          return;
        }
        const rows = customers.map((customer) => ({
          user_id: customer.id,
          title: form.title.trim(),
          body: form.body.trim(),
          type: form.type,
          data: {},
        }));
        const { error } = await supabase.from("notifications").insert(rows as never);
        if (error) throw error;
        toast.success(`Sent to ${customers.length} customers`);
      } else {
        const { error } = await supabase.from("notifications").insert({
          user_id: form.user_id,
          title: form.title.trim(),
          body: form.body.trim(),
          type: form.type,
          data: {},
        } as never);
        if (error) throw error;
        toast.success("Notification sent");
      }

      setModalOpen(false);
      await fetchData();
    } catch (err) {
      console.error("[admin/notifications] Save failed:", err);
      toast.error("Failed to save notification");
    } finally {
      setSaving(false);
    }
  };

  const toggleRead = async (notification: NotificationRow) => {
    const nextRead = !notification.is_read;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, is_read: nextRead } : n))
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: nextRead } as never)
      .eq("id", notification.id);

    if (error) {
      toast.error("Failed to update notification");
      fetchData();
    }
  };

  const handleDelete = async (notification: NotificationRow) => {
    if (!confirm(`Delete notification "${notification.title}"?`)) return;

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notification.id);

    if (error) {
      toast.error("Failed to delete notification");
      return;
    }

    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    toast.success("Notification deleted");
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true } as never)
      .in("id", unreadIds);

    if (error) {
      toast.error("Failed to mark all read");
      return;
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-brand-gray-100 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-400">Total</p>
          <p className="mt-1 text-2xl font-bold text-brand-black">{notifications.length}</p>
        </div>
        <div className="rounded-xl border border-brand-gray-100 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-400">Unread</p>
          <p className="mt-1 text-2xl font-bold text-brand-black">{unreadCount}</p>
        </div>
        <div className="rounded-xl border border-brand-gray-100 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gray-400">Customers</p>
          <p className="mt-1 text-2xl font-bold text-brand-black">{customers.length}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-brand-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications..."
            className="w-full rounded-lg border border-brand-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-brand-gray-100 bg-white">
        {filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Bell className="mx-auto mb-3 h-10 w-10 text-brand-gray-300" />
            <p className="font-semibold text-brand-gray-500">No notifications found</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-gray-100">
            {filtered.map((notification) => (
              <div key={notification.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", TYPE_STYLES[notification.type])}>
                      {notification.type}
                    </span>
                    {!notification.is_read && (
                      <span className="rounded-full bg-brand-yellow/20 px-2 py-0.5 text-xs font-bold text-brand-black">
                        Unread
                      </span>
                    )}
                    <span className="text-xs text-brand-gray-400">
                      {formatDateTime(notification.created_at)}
                    </span>
                  </div>
                  <p className="font-bold text-brand-black">{notification.title}</p>
                  <p className="mt-1 text-sm text-brand-gray-600">{notification.body}</p>
                  <p className="mt-2 text-xs text-brand-gray-400">
                    {(notification.profiles?.full_name || notification.profiles?.email || notification.profiles?.phone || "Customer")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleRead(notification)}
                    className="rounded-lg p-2 text-brand-gray-500 hover:bg-brand-gray-50 hover:text-brand-black"
                    title={notification.is_read ? "Mark unread" : "Mark read"}
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openEdit(notification)}
                    className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(notification)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Notification" : "Send Notification"}
      >
        <div className="space-y-4">
          {!editing && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-gray-600">Send To</label>
              <select
                value={form.target}
                onChange={(e) => setForm((prev) => ({ ...prev, target: e.target.value as "all" | "single" }))}
                className="w-full rounded-lg border border-brand-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30"
              >
                <option value="single">Single Customer</option>
                <option value="all">All Customers</option>
              </select>
            </div>
          )}

          {!editing && form.target === "single" && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-gray-600">Customer</label>
              <select
                value={form.user_id}
                onChange={(e) => setForm((prev) => ({ ...prev, user_id: e.target.value }))}
                className="w-full rounded-lg border border-brand-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30"
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.full_name || customer.email || customer.phone || customer.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-gray-600">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as NotificationType }))}
              className="w-full rounded-lg border border-brand-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          />

          <div>
            <label className="mb-1 block text-xs font-semibold text-brand-gray-600">Message</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              rows={4}
              className="w-full resize-none rounded-lg border border-brand-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editing ? "Save" : "Send"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
