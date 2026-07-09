"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Order, Wallet, LoyaltyAccount, LoyaltyTier } from "@/lib/supabase/types";
import { formatCurrency, formatDate, formatDateTime, cn } from "@/lib/utils/helpers";
import { ORDER_STATUS_LABELS } from "@/lib/utils/constants";
import { Input, Badge, Button, Modal, Spinner, Tabs } from "@/components/ui";
import {
  Search,
  Users,
  Phone,
  Mail,
  Calendar,
  ChevronDown,
  ChevronUp,
  Wallet as WalletIcon,
  ShoppingBag,
  UserPlus,
  Shield,
  Download,
  Building2,
  Eye,
  Settings,
  ClipboardList,
  BarChart3,
  Gift,
  Bell,
  Megaphone,
} from "lucide-react";
import toast from "react-hot-toast";

type CustomerRow = Profile & {
  wallet?: Wallet | null;
  loyalty_account?: (LoyaltyAccount & { tier?: LoyaltyTier | null }) | null;
  order_count?: number;
  lifetime_value?: number;
};

type UserForm = {
  email: string;
  full_name: string;
  phone: string;
  role: Profile["role"];
  permissions: Record<string, boolean>;
};

const EMPTY_USER_FORM: UserForm = {
  email: "",
  full_name: "",
  phone: "",
  role: "customer",
  permissions: {},
};

const ROLE_LABELS: Record<Profile["role"], string> = {
  customer: "Customer",
  outlet_staff: "Outlet Staff",
  admin: "Admin",
  super_admin: "Super Admin",
};

const ROLE_VARIANTS: Record<Profile["role"], "default" | "success" | "warning" | "danger" | "info"> = {
  customer: "default",
  outlet_staff: "info",
  admin: "warning",
  super_admin: "danger",
};

const STAFF_ROLES: Profile["role"][] = ["outlet_staff", "admin", "super_admin"];

// Permission definitions per role
const ROLE_PERMISSIONS: Record<string, { key: string; label: string; icon: React.ReactNode; description: string }[]> = {
  outlet_staff: [
    { key: "view_orders", label: "View Orders", icon: <ClipboardList className="w-4 h-4" />, description: "View and manage incoming orders" },
    { key: "manage_menu", label: "Manage Menu", icon: <Settings className="w-4 h-4" />, description: "Toggle item availability, update prices" },
    { key: "view_customers", label: "View Customers", icon: <Eye className="w-4 h-4" />, description: "View customer profiles and order history" },
  ],
  admin: [
    { key: "view_orders", label: "View Orders", icon: <ClipboardList className="w-4 h-4" />, description: "View and manage all orders" },
    { key: "manage_menu", label: "Manage Menu", icon: <Settings className="w-4 h-4" />, description: "Full menu CRUD - categories, items, customizations" },
    { key: "manage_customers", label: "Manage Customers", icon: <Users className="w-4 h-4" />, description: "View customers, change roles, manage wallets" },
    { key: "view_analytics", label: "View Analytics", icon: <BarChart3 className="w-4 h-4" />, description: "Access dashboard and sales reports" },
    { key: "manage_coupons", label: "Manage Coupons", icon: <Gift className="w-4 h-4" />, description: "Create and manage discount coupons" },
    { key: "manage_campaigns", label: "Manage Campaigns", icon: <Megaphone className="w-4 h-4" />, description: "Create loyalty campaigns and missions" },
    { key: "send_notifications", label: "Send Notifications", icon: <Bell className="w-4 h-4" />, description: "Send push notifications to customers" },
  ],
  super_admin: [
    { key: "full_access", label: "Full Access", icon: <Shield className="w-4 h-4" />, description: "Unrestricted access to all features - cannot be customized" },
  ],
};

function getDefaultPermissions(role: Profile["role"]): Record<string, boolean> {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return {};
  if (role === "super_admin") return { full_access: true };
  const result: Record<string, boolean> = {};
  for (const p of perms) result[p.key] = true;
  return result;
}

export default function AdminCustomersPage() {
  const [allUsers, setAllUsers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("customers");
  const [customerSearch, setCustomerSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  // Filters
  const [customerSort, setCustomerSort] = useState<"recent" | "most_orders" | "highest_wallet">("recent");
  const [customerHasWallet, setCustomerHasWallet] = useState(false);
  const [staffRoleFilter, setStaffRoleFilter] = useState<"all" | "outlet_staff" | "admin" | "super_admin">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Order[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const supabase = createClient();

  // Create user modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalTab, setCreateModalTab] = useState<"customer" | "staff">("customer");
  const [userForm, setUserForm] = useState<UserForm>(EMPTY_USER_FORM);
  const [formSaving, setFormSaving] = useState(false);

  // Role change
  const [roleChangeUser, setRoleChangeUser] = useState<CustomerRow | null>(null);
  const [newRole, setNewRole] = useState<Profile["role"]>("customer");
  const [roleSaving, setRoleSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profileError) throw profileError;

      const profiles = (profileData as Profile[] | null) ?? [];

      if (profiles.length === 0) {
        setAllUsers([]);
        setLoading(false);
        return;
      }

      const userIds = profiles.map((p) => p.id);

      const [walletsRes, loyaltyRes, tiersRes, ordersRes] = await Promise.all([
        supabase.from("wallets").select("*").in("user_id", userIds),
        supabase.from("loyalty_accounts").select("*").in("user_id", userIds),
        supabase.from("loyalty_tiers").select("*"),
        supabase.from("orders").select("user_id, total").in("user_id", userIds),
      ]);

      const wallets = (walletsRes.data as Wallet[] | null) ?? [];
      const loyaltyAccounts = (loyaltyRes.data as LoyaltyAccount[] | null) ?? [];
      const tiers = (tiersRes.data as LoyaltyTier[] | null) ?? [];
      const orderRows = (ordersRes.data as { user_id: string; total: number }[] | null) ?? [];

      const walletMap: Record<string, Wallet> = {};
      for (const w of wallets) walletMap[w.user_id] = w;

      const loyaltyMap: Record<string, LoyaltyAccount> = {};
      for (const l of loyaltyAccounts) loyaltyMap[l.user_id] = l;

      const tierMap: Record<string, LoyaltyTier> = {};
      for (const t of tiers) tierMap[t.id] = t;

      const orderCountMap: Record<string, number> = {};
      const lifetimeValueMap: Record<string, number> = {};
      for (const o of orderRows) {
        orderCountMap[o.user_id] = (orderCountMap[o.user_id] || 0) + 1;
        lifetimeValueMap[o.user_id] = (lifetimeValueMap[o.user_id] || 0) + (o.total || 0);
      }

      const merged: CustomerRow[] = profiles.map((p) => {
        const la = loyaltyMap[p.id];
        return {
          ...p,
          wallet: walletMap[p.id] ?? null,
          loyalty_account: la ? { ...la, tier: tierMap[la.tier_id] ?? null } : null,
          order_count: orderCountMap[p.id] ?? 0,
          lifetime_value: lifetimeValueMap[p.id] ?? 0,
        };
      });

      setAllUsers(merged);
    } catch (err) {
      console.error("[admin/customers] Failed to load users:", err);
      setAllUsers([]);
      toast.error("Could not load users");
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Split into customers vs staff
  const customers = useMemo(() => allUsers.filter((u) => u.role === "customer"), [allUsers]);
  const staff = useMemo(() => allUsers.filter((u) => STAFF_ROLES.includes(u.role)), [allUsers]);

  // Filter by search
  const filterBySearch = (users: CustomerRow[], query: string) => {
    if (!query) return users;
    const q = query.toLowerCase();
    return users.filter(
      (c) =>
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
    );
  };

  const filteredCustomers = useMemo(() => {
    let result = filterBySearch(customers, customerSearch);
    if (customerHasWallet) {
      result = result.filter((c) => (c.wallet?.loaded_balance ?? 0) + (c.wallet?.bonus_balance ?? 0) > 0);
    }
    if (customerSort === "most_orders") {
      result = [...result].sort((a, b) => (b.order_count ?? 0) - (a.order_count ?? 0));
    } else if (customerSort === "highest_wallet") {
      result = [...result].sort(
        (a, b) =>
          ((b.wallet?.loaded_balance ?? 0) + (b.wallet?.bonus_balance ?? 0)) -
          ((a.wallet?.loaded_balance ?? 0) + (a.wallet?.bonus_balance ?? 0))
      );
    }
    return result;
  }, [customers, customerSearch, customerSort, customerHasWallet]);

  const filteredStaff = useMemo(() => {
    let result = filterBySearch(staff, staffSearch);
    if (staffRoleFilter !== "all") {
      result = result.filter((s) => s.role === staffRoleFilter);
    }
    return result;
  }, [staff, staffSearch, staffRoleFilter]);

  // Expand / collapse
  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setExpandedLoading(true);
    try {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(10);
      setExpandedOrders((data as Order[] | null) ?? []);
    } catch {
      setExpandedOrders([]);
    }
    setExpandedLoading(false);
  };

  // Role change
  const openRoleChange = (user: CustomerRow) => {
    setRoleChangeUser(user);
    setNewRole(user.role);
  };

  const handleRoleChange = async () => {
    if (!roleChangeUser) return;
    setRoleSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: roleChangeUser.id, role: newRole }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Could not update role");
      toast.success("Role updated");
      setRoleChangeUser(null);
      await fetchUsers();
    } catch (err) {
      console.error("[admin/customers] Role change failed:", err);
      toast.error("Could not update role");
    } finally {
      setRoleSaving(false);
    }
  };

  // Open create modal
  const openCreateModal = (type: "customer" | "staff") => {
    const role = type === "customer" ? "customer" : "outlet_staff";
    setCreateModalTab(type);
    setUserForm({
      ...EMPTY_USER_FORM,
      role,
      permissions: getDefaultPermissions(role),
    });
    setCreateModalOpen(true);
  };

  // Handle role change in form
  const handleFormRoleChange = (role: Profile["role"]) => {
    setUserForm((prev) => ({
      ...prev,
      role,
      permissions: getDefaultPermissions(role),
    }));
  };

  // Toggle permission
  const togglePermission = (key: string) => {
    setUserForm((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }));
  };

  // Create user
  const handleCreateUser = async () => {
    if (!userForm.full_name) {
      toast.error("Enter a full name");
      return;
    }
    if (!userForm.email) {
      toast.error("Enter an email address");
      return;
    }
    setFormSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userForm.email,
          full_name: userForm.full_name,
          phone: userForm.phone || null,
          role: userForm.role,
        }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Could not create user");
      toast.success("User created. They can set a password with the reset-password flow.");
      setCreateModalOpen(false);
      setUserForm(EMPTY_USER_FORM);
      await fetchUsers();
    } catch (err) {
      console.error("[admin/customers] Create user failed:", err);
      toast.error("Could not create user");
    } finally {
      setFormSaving(false);
    }
  };

  // Export
  const handleExport = () => {
    const data = activeTab === "customers" ? filteredCustomers : filteredStaff;
    const csv = [
      "Name,Email,Phone,Role,Orders,Joined",
      ...data.map(
        (c) =>
          `"${c.full_name ?? ""}","${c.email ?? ""}","${c.phone ?? ""}","${c.role}",${c.order_count},"${formatDate(c.created_at)}"`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnut-monster-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render a user row
  const renderUserRow = (user: CustomerRow) => {
    const isExpanded = expandedId === user.id;
    const walletBalance = (user.wallet?.loaded_balance ?? 0) + (user.wallet?.bonus_balance ?? 0);
    const isStaffUser = STAFF_ROLES.includes(user.role);

    return (
      <div key={user.id}>
        <div className="flex items-center gap-4 px-5 py-4 hover:bg-brand-gray-50 transition-colors">
          <button
            onClick={() => toggleExpand(user.id)}
            className="flex items-center gap-4 flex-1 min-w-0 text-left"
          >
            {/* Avatar */}
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                isStaffUser ? "bg-blue-100" : "bg-brand-yellow/20"
              )}
            >
              <span
                className={cn(
                  "font-bold text-sm",
                  isStaffUser ? "text-blue-700" : "text-brand-yellow-dark"
                )}
              >
                {(user.full_name ?? "?").charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-brand-black truncate">
                  {user.full_name || "Unnamed"}
                </p>
                <Badge variant={ROLE_VARIANTS[user.role]}>
                  {ROLE_LABELS[user.role]}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-sm text-brand-gray-500">
                {user.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {user.phone}
                  </span>
                )}
                {user.email && (
                  <span className="hidden sm:flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {user.email}
                  </span>
                )}
              </div>
            </div>

            {/* Stats - only for customers */}
            {!isStaffUser && (
              <div className="hidden md:flex items-center gap-6 shrink-0 text-sm">
                <div className="text-center">
                  <p className="font-bold text-brand-black">{user.order_count}</p>
                  <p className="text-xs text-brand-gray-400">Orders</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-brand-black">{formatCurrency(walletBalance)}</p>
                  <p className="text-xs text-brand-gray-400">Wallet</p>
                </div>
                {user.loyalty_account?.tier && (
                  <Badge variant="warning">{user.loyalty_account.tier.name}</Badge>
                )}
              </div>
            )}

            {/* Joined */}
            <div className="hidden lg:flex items-center gap-1 text-xs text-brand-gray-400 shrink-0">
              <Calendar className="w-3 h-3" />
              {formatDate(user.created_at)}
            </div>

            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-brand-gray-400 shrink-0" />
            ) : (
              <ChevronDown className="w-5 h-5 text-brand-gray-400 shrink-0" />
            )}
          </button>

          {/* Role change button */}
          <button
            onClick={() => openRoleChange(user)}
            className="shrink-0 p-1.5 rounded-lg hover:bg-brand-gray-100 text-brand-gray-400 transition-colors"
            title="Change Role"
          >
            <Shield className="w-4 h-4" />
          </button>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-5 pb-5 pt-0">
            {/* Mobile stats (customers only) */}
            {!isStaffUser && (
              <div className="flex md:hidden items-center gap-4 mb-4 text-sm">
                <span className="flex items-center gap-1">
                  <ShoppingBag className="w-4 h-4 text-brand-gray-400" />
                  {user.order_count} orders
                </span>
                <span className="flex items-center gap-1">
                  <WalletIcon className="w-4 h-4 text-brand-gray-400" />
                  {formatCurrency(walletBalance)}
                </span>
                {user.loyalty_account?.tier && (
                  <Badge variant="warning">{user.loyalty_account.tier.name}</Badge>
                )}
              </div>
            )}

            {/* Wallet & Loyalty details (customers) */}
            {!isStaffUser && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <div className="bg-brand-gray-50 rounded-lg p-3">
                  <p className="text-xs text-brand-gray-500">Loaded Balance</p>
                  <p className="font-bold text-brand-black">
                    {formatCurrency(user.wallet?.loaded_balance ?? 0)}
                  </p>
                </div>
                <div className="bg-brand-gray-50 rounded-lg p-3">
                  <p className="text-xs text-brand-gray-500">Bonus Balance</p>
                  <p className="font-bold text-brand-black">
                    {formatCurrency(user.wallet?.bonus_balance ?? 0)}
                  </p>
                </div>
                <div className="bg-brand-gray-50 rounded-lg p-3">
                  <p className="text-xs text-brand-gray-500">Loyalty Points</p>
                  <p className="font-bold text-brand-black">
                    {user.loyalty_account?.current_points?.toLocaleString() ?? 0}
                  </p>
                </div>
                <div className="bg-brand-gray-50 rounded-lg p-3">
                  <p className="text-xs text-brand-gray-500">Lifetime Points</p>
                  <p className="font-bold text-brand-black">
                    {user.loyalty_account?.lifetime_points?.toLocaleString() ?? 0}
                  </p>
                </div>
                <div className="bg-brand-gray-50 rounded-lg p-3">
                  <p className="text-xs text-brand-gray-500">Lifetime Value</p>
                  <p className="font-bold text-brand-black">
                    {formatCurrency(user.lifetime_value ?? 0)}
                  </p>
                </div>
              </div>
            )}

            {/* Staff info */}
            {isStaffUser && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600">Role</p>
                  <p className="font-bold text-blue-900">{ROLE_LABELS[user.role]}</p>
                </div>
                <div className="bg-brand-gray-50 rounded-lg p-3">
                  <p className="text-xs text-brand-gray-500">Email</p>
                  <p className="font-bold text-brand-black text-sm truncate">{user.email ?? "N/A"}</p>
                </div>
                <div className="bg-brand-gray-50 rounded-lg p-3">
                  <p className="text-xs text-brand-gray-500">Phone</p>
                  <p className="font-bold text-brand-black">{user.phone ?? "N/A"}</p>
                </div>
              </div>
            )}

            {/* Recent Orders */}
            <h4 className="text-sm font-semibold text-brand-gray-700 mb-2">
              {isStaffUser ? "Recent Activity" : "Recent Orders"}
            </h4>
            {expandedLoading ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : expandedOrders.length === 0 ? (
              <p className="text-sm text-brand-gray-400 py-3">
                {isStaffUser ? "No activity recorded" : "No orders yet"}
              </p>
            ) : (
              <div className="space-y-2">
                {expandedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between bg-brand-gray-50 rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-brand-black">#{order.order_number}</span>
                    <Badge
                      variant={
                        order.status === "picked_up" ? "success" : order.status === "cancelled" ? "danger" : "default"
                      }
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                    <span className="text-brand-gray-500">{formatCurrency(order.total)}</span>
                    <span className="text-xs text-brand-gray-400 hidden sm:block">
                      {formatDateTime(order.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render a user list section
  const renderUserList = (users: CustomerRow[], emptyIcon: React.ReactNode, emptyText: string) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      );
    }

    if (users.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
          {emptyIcon}
          <p className="text-base font-semibold mt-3">{emptyText}</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl shadow-sm border border-brand-gray-100 divide-y divide-brand-gray-100">
        {users.map(renderUserRow)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-brand-gray-100">
        <Tabs
          tabs={[
            { label: `Customers (${customers.length})`, value: "customers" },
            { label: `Staff & Admin (${staff.length})`, value: "staff" },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* === CUSTOMERS TAB === */}
      {activeTab === "customers" && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="max-w-sm flex-1 relative">
                <Input
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleExport} size="sm" variant="ghost">
                <Download className="w-4 h-4" />
                Export
              </Button>
              <Button onClick={() => openCreateModal("customer")} size="sm">
                <UserPlus className="w-4 h-4" />
                Add Customer
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={customerSort}
              onChange={(e) => setCustomerSort(e.target.value as typeof customerSort)}
              className="rounded-lg border border-brand-gray-200 bg-white px-3 py-1.5 text-sm text-brand-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            >
              <option value="recent">Recent First</option>
              <option value="most_orders">Most Orders</option>
              <option value="highest_wallet">Highest Wallet</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-brand-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={customerHasWallet}
                onChange={(e) => setCustomerHasWallet(e.target.checked)}
                className="h-4 w-4 rounded border-brand-gray-300 accent-amber-500"
              />
              Has wallet balance
            </label>
            <span className="ml-auto text-sm text-brand-gray-500">
              {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? "s" : ""}
            </span>
          </div>

          {renderUserList(
            filteredCustomers,
            <Users className="w-12 h-12" />,
            "No customers found"
          )}
        </>
      )}

      {/* === STAFF & ADMIN TAB === */}
      {activeTab === "staff" && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="max-w-sm flex-1 relative">
                <Input
                  placeholder="Search staff & admins..."
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleExport} size="sm" variant="ghost">
                <Download className="w-4 h-4" />
                Export
              </Button>
              <Button onClick={() => openCreateModal("staff")} size="sm">
                <UserPlus className="w-4 h-4" />
                Create Staff Account
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={staffRoleFilter}
              onChange={(e) => setStaffRoleFilter(e.target.value as typeof staffRoleFilter)}
              className="rounded-lg border border-brand-gray-200 bg-white px-3 py-1.5 text-sm text-brand-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            >
              <option value="all">All Roles</option>
              <option value="outlet_staff">Outlet Staff</option>
              <option value="admin">Admins</option>
              <option value="super_admin">Super Admins</option>
            </select>
            <span className="ml-auto text-sm text-brand-gray-500">
              {filteredStaff.length} staff member{filteredStaff.length !== 1 ? "s" : ""}
            </span>
          </div>

          {renderUserList(
            filteredStaff,
            <Building2 className="w-12 h-12" />,
            "No staff members found"
          )}
        </>
      )}

      {/* Role Change Modal */}
      <Modal
        open={!!roleChangeUser}
        onClose={() => setRoleChangeUser(null)}
        title="Change User Role"
        className="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-gray-600">
            Change role for <strong>{roleChangeUser?.full_name ?? "User"}</strong>
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-brand-gray-700">New Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Profile["role"])}
              className="w-full rounded-xl border border-brand-gray-300 bg-white px-4 py-2.5 text-base text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-brand-yellow"
            >
              <option value="customer">Customer</option>
              <option value="outlet_staff">Outlet Staff</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          {newRole !== "customer" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-700">
                Changing role to <strong>{ROLE_LABELS[newRole]}</strong> will grant elevated permissions.
                Make sure this is intentional.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setRoleChangeUser(null)}>Cancel</Button>
          <Button size="sm" loading={roleSaving} onClick={handleRoleChange}>
            Update Role
          </Button>
        </div>
      </Modal>

      {/* Create User Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={createModalTab === "customer" ? "Add Customer" : "Create Staff Account"}
        className="max-w-lg"
      >
        <div className="space-y-5">
          {/* Basic Info */}
          <div className="space-y-4">
            <Input
              label="Full Name"
              value={userForm.full_name}
              onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
              placeholder={createModalTab === "customer" ? "e.g. Rahul Mehta" : "e.g. Priya Sharma"}
            />
            <Input
              label="Email"
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              placeholder={createModalTab === "customer" ? "customer@example.com" : "staff@pnutmonster.com"}
            />
            <Input
              label={createModalTab === "customer" ? "Phone" : "Phone (optional)"}
              value={userForm.phone}
              onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
              placeholder="+91..."
            />
          </div>

          {/* Role Selection - only for staff */}
          {createModalTab === "staff" && (
            <div className="space-y-3">
              <label className="text-sm font-semibold text-brand-gray-700">Assign Role</label>
              <div className="grid grid-cols-3 gap-2">
                {(["outlet_staff", "admin", "super_admin"] as Profile["role"][]).map((role) => (
                  <button
                    key={role}
                    onClick={() => handleFormRoleChange(role)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all text-center",
                      userForm.role === role
                        ? "border-brand-yellow bg-brand-yellow/5"
                        : "border-brand-gray-200 hover:border-brand-gray-300"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        role === "outlet_staff" && "bg-blue-100 text-blue-600",
                        role === "admin" && "bg-amber-100 text-amber-600",
                        role === "super_admin" && "bg-red-100 text-red-600"
                      )}
                    >
                      {role === "outlet_staff" && <Users className="w-4 h-4" />}
                      {role === "admin" && <Settings className="w-4 h-4" />}
                      {role === "super_admin" && <Shield className="w-4 h-4" />}
                    </div>
                    <span className="text-xs font-semibold text-brand-black">{ROLE_LABELS[role]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Access Customization - only for staff roles */}
          {createModalTab === "staff" && ROLE_PERMISSIONS[userForm.role] && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-brand-gray-700">Customize Access</label>
                {userForm.role !== "super_admin" && (
                  <button
                    onClick={() => {
                      const perms = getDefaultPermissions(userForm.role);
                      const allEnabled = Object.values(userForm.permissions).every(Boolean);
                      const toggled: Record<string, boolean> = {};
                      for (const key of Object.keys(perms)) toggled[key] = !allEnabled;
                      setUserForm((prev) => ({ ...prev, permissions: toggled }));
                    }}
                    className="text-xs text-brand-yellow-dark hover:underline font-medium"
                  >
                    {Object.values(userForm.permissions).every(Boolean) ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {ROLE_PERMISSIONS[userForm.role].map((perm) => {
                  const isSuper = userForm.role === "super_admin";
                  const checked = isSuper || userForm.permissions[perm.key];

                  return (
                    <label
                      key={perm.key}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
                        checked
                          ? "border-brand-yellow/50 bg-brand-yellow/5"
                          : "border-brand-gray-200 hover:border-brand-gray-300",
                        isSuper && "cursor-default opacity-80"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={!!checked}
                        onChange={() => !isSuper && togglePermission(perm.key)}
                        disabled={isSuper}
                        className="mt-0.5 h-4 w-4 rounded border-brand-gray-300 text-brand-yellow focus:ring-brand-yellow accent-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-brand-gray-500">{perm.icon}</span>
                          <span className="text-sm font-semibold text-brand-black">{perm.label}</span>
                        </div>
                        <p className="text-xs text-brand-gray-500 mt-0.5">{perm.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Info callout */}
          <div className={cn(
            "rounded-lg p-3 border",
            createModalTab === "customer"
              ? "bg-green-50 border-green-200"
              : "bg-blue-50 border-blue-200"
          )}>
            <p className={cn(
              "text-xs",
              createModalTab === "customer" ? "text-green-700" : "text-blue-700"
            )}>
              {createModalTab === "customer"
                ? "Customer account will be created in Supabase Auth and can use the reset-password flow to set a password."
                : "Staff account will be created in Supabase Auth. Assign outlet access from the Outlets page."
              }
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-gray-100">
          <Button variant="ghost" size="sm" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
          <Button size="sm" loading={formSaving} onClick={handleCreateUser}>
            {createModalTab === "customer" ? "Add Customer" : "Create Account"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
