export const APP_NAME = "PNUT MONSTER";
export const APP_TAGLINE = "Healthy never tasted this fun!";

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
  rejected: "Rejected",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-brand-yellow",
  confirmed: "bg-blue-500",
  preparing: "bg-brand-orange",
  ready: "bg-brand-green",
  picked_up: "bg-brand-gray-400",
  cancelled: "bg-brand-red",
  rejected: "bg-red-700",
};
