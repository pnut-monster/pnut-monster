"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Clock, ShoppingBag } from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils/helpers";
import type { Order, OrderItem } from "@/lib/supabase/types";

export default function OrderConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      const supabase = createClient();

      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      const fetchedOrder = orderData as Order | null;

      if (fetchedOrder) {
        setOrder(fetchedOrder);

        const { data: itemsData } = await supabase
          .from("order_items")
          .select("*")
          .eq("order_id", orderId);

        const fetchedItems = (itemsData as OrderItem[] | null) ?? [];
        setOrderItems(fetchedItems);
      }

      setLoading(false);
    }

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
        <div className="text-center">
          <ShoppingBag className="h-16 w-16 text-brand-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-brand-black mb-2">
            Order not found
          </h2>
          <Button onClick={() => router.push("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream pb-8">
      {/* Success Animation */}
      <div className="flex flex-col items-center pt-12 pb-6 px-4">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 20,
            delay: 0.1,
          }}
          className="w-20 h-20 rounded-full bg-brand-green flex items-center justify-center mb-6"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 15,
              delay: 0.4,
            }}
          >
            <Check className="h-10 w-10 text-white" strokeWidth={3} />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold font-[family-name:var(--font-heading)] text-brand-black mb-1">
            Order Placed!
          </h1>
          <p className="text-brand-gray-600 text-sm">
            Your order has been received
          </p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4 }}
        className="px-4 space-y-4"
      >
        {/* Order Number */}
        <Card className="text-center">
          <p className="text-xs text-brand-gray-500 uppercase tracking-wide mb-1">
            Order Number
          </p>
          <p className="text-2xl font-bold font-[family-name:var(--font-heading)] text-brand-black">
            {order.order_number}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-3 text-brand-yellow-dark">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-semibold">
              Estimated ready in 15-20 mins
            </span>
          </div>
        </Card>

        {/* Order Items */}
        <Card>
          <h3 className="font-semibold text-brand-black text-sm mb-3">
            Order Summary
          </h3>
          <div className="space-y-2">
            {orderItems.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center text-sm"
              >
                <div className="flex-1">
                  <span className="text-brand-black">
                    {item.quantity}x {item.item_name}
                  </span>
                </div>
                <span className="font-semibold text-brand-black ml-2">
                  {formatCurrency(item.total_price)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-brand-gray-200 mt-3 pt-3 flex justify-between font-bold text-brand-black">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => router.push(`/orders/${orderId}`)}
          >
            Track Order
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            onClick={() => router.push("/")}
          >
            Back to Home
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
