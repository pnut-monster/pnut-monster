export const APP_NAME = "PNUT MONSTER";
export const APP_TAGLINE = "Healthy never tasted this fun!";

export const TAX_RATE = 0.05; // 5% GST
export const PACKAGING_CHARGE = 10; // ₹10 flat

export const LOYALTY_TIERS = {
  SPROUT_STAR: "sprout_star",
  SPROUT_HERO: "sprout_hero",
  PNUT_LEGEND: "pnut_legend",
} as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Order Placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  picked_up: "Picked Up",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-brand-yellow",
  confirmed: "bg-blue-500",
  preparing: "bg-brand-orange",
  ready: "bg-brand-green",
  picked_up: "bg-brand-gray-400",
  cancelled: "bg-brand-red",
};
