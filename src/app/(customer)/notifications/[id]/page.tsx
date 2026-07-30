"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Bell, ShoppingBag, Wallet, Star, Gift, Boxes } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import type { Notification } from "@/lib/supabase/types";

function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "order":
      return (
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-6 h-6 text-blue-600" />
        </div>
      );
    case "wallet":
      return (
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <Wallet className="w-6 h-6 text-green-600" />
        </div>
      );
    case "loyalty":
      return (
        <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
          <Star className="w-6 h-6 text-brand-yellow-dark" />
        </div>
      );
    case "campaign":
      return (
        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
          <Gift className="w-6 h-6 text-purple-600" />
        </div>
      );
    case "batch":
      return (
        <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
          <Boxes className="w-6 h-6 text-orange-600" />
        </div>
      );
    default:
      return (
        <div className="w-12 h-12 rounded-full bg-brand-gray-100 flex items-center justify-center shrink-0">
          <Bell className="w-6 h-6 text-brand-gray-600" />
        </div>
      );
  }
}

export default function NotificationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const notifId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNotification() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("id", notifId)
        .single();

      if (data) {
        const notif = data as Notification;
        setNotification(notif);

        if (!notif.is_read) {
          await supabase
            .from("notifications")
            .update({ is_read: true } as never)
            .eq("id", notifId);
        }
      }
      setLoading(false);
    }

    fetchNotification();
  }, [notifId, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!notification) {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-brand-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-brand-gray-600" />
        </button>
        <div className="mt-10 text-center">
          <Bell className="w-12 h-12 text-brand-gray-300 mx-auto mb-3" />
          <p className="text-brand-gray-500">Notification not found</p>
        </div>
      </div>
    );
  }

  const date = new Date(notification.created_at);
  const formattedDate = date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-brand-gray-100 transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5 text-brand-gray-600" />
        </button>
        <h1 className="font-heading text-xl font-bold text-brand-black">
          Notification
        </h1>
      </div>

      {/* Notification content */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-brand-gray-100">
        <div className="flex items-start gap-4 mb-4">
          <NotificationIcon type={notification.type} />
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-lg font-bold text-brand-black">
              {notification.title}
            </h2>
            <p className="text-xs text-brand-gray-400 mt-1">
              {formattedDate} at {formattedTime}
            </p>
          </div>
        </div>

        <div className="border-t border-brand-gray-100 pt-4">
          <p className="text-sm text-brand-gray-700 leading-relaxed whitespace-pre-wrap">
            {notification.body}
          </p>
        </div>
      </div>
    </div>
  );
}
