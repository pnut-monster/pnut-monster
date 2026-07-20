"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  ChevronLeft,
  ShoppingBag,
  Wallet,
  Star,
  Gift,
  CheckCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/helpers";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import type { Notification } from "@/lib/supabase/types";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "order":
      return (
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5 text-blue-600" />
        </div>
      );
    case "wallet":
      return (
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-green-600" />
        </div>
      );
    case "loyalty":
      return (
        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
          <Star className="w-5 h-5 text-brand-yellow-dark" />
        </div>
      );
    case "campaign":
      return (
        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-purple-600" />
        </div>
      );
    case "general":
    default:
      return (
        <div className="w-10 h-10 rounded-full bg-brand-gray-100 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-brand-gray-600" />
        </div>
      );
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id ?? null;
      setUserId(currentUserId);

      if (!currentUserId) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(100);

      const notifs = (data ?? []) as Notification[];
      setNotifications(notifs);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`customer-notifications-page-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, supabase, userId]);

  const markAsRead = async (notif: Notification) => {
    if (notif.is_read) return;

    // Optimistically update UI
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
    );

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true } as never)
      .eq("id", notif.id);

    if (error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: false } : n))
      );
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications
      .filter((n) => !n.is_read)
      .map((n) => n.id);

    if (unreadIds.length === 0) return;

    // Optimistically update UI
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

    if (!userId) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true } as never)
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) fetchNotifications();
  };

  const { todayNotifs, earlierNotifs, unreadCount } = useMemo(() => {
    const today: Notification[] = [];
    const earlier: Notification[] = [];
    let unread = 0;

    for (const notification of notifications) {
      if (!notification.is_read) unread += 1;
      if (isToday(notification.created_at)) {
        today.push(notification);
      } else {
        earlier.push(notification);
      }
    }

    return {
      todayNotifs: today,
      earlierNotifs: earlier,
      unreadCount: unread,
    };
  }, [notifications]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-brand-gray-100 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5 text-brand-gray-600" />
          </button>
          <h1 className="font-heading text-xl font-bold text-brand-black">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <span className="bg-brand-yellow text-brand-black text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-yellow-dark hover:text-brand-black transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {/* Empty State */}
      {notifications.length === 0 && (
        <EmptyState
          icon={<Bell className="w-12 h-12" />}
          title="No notifications yet"
          description="You'll see order updates, wallet alerts, and reward notifications here."
        />
      )}

      {/* Today Section */}
      {todayNotifs.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-brand-gray-400 uppercase tracking-wider mb-2.5">
            Today
          </h2>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {todayNotifs.map((notif, index) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                >
                  <button
                    onClick={() => markAsRead(notif)}
                    className={cn(
                      "w-full text-left bg-white rounded-xl p-4 flex items-start gap-3 shadow-sm border transition-colors",
                      notif.is_read
                        ? "border-brand-gray-100"
                        : "border-brand-yellow/30 bg-brand-yellow/5"
                    )}
                  >
                    <NotificationIcon type={notif.type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-brand-black truncate">
                          {notif.title}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-brand-gray-400">
                            {timeAgo(notif.created_at)}
                          </span>
                          {!notif.is_read && (
                            <span className="w-2 h-2 rounded-full bg-brand-yellow shrink-0" />
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-brand-gray-500 mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                    </div>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Earlier Section */}
      {earlierNotifs.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-brand-gray-400 uppercase tracking-wider mb-2.5">
            Earlier
          </h2>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {earlierNotifs.map((notif, index) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{
                    duration: 0.2,
                    delay: (todayNotifs.length + index) * 0.04,
                  }}
                >
                  <button
                    onClick={() => markAsRead(notif)}
                    className={cn(
                      "w-full text-left bg-white rounded-xl p-4 flex items-start gap-3 shadow-sm border transition-colors",
                      notif.is_read
                        ? "border-brand-gray-100"
                        : "border-brand-yellow/30 bg-brand-yellow/5"
                    )}
                  >
                    <NotificationIcon type={notif.type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-brand-black truncate">
                          {notif.title}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-brand-gray-400">
                            {timeAgo(notif.created_at)}
                          </span>
                          {!notif.is_read && (
                            <span className="w-2 h-2 rounded-full bg-brand-yellow shrink-0" />
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-brand-gray-500 mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                    </div>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
