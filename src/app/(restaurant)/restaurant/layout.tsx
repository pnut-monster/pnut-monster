import { RestaurantShell } from "./restaurant-shell";

export const dynamic = "force-dynamic";

export default function RestaurantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestaurantShell>{children}</RestaurantShell>;
}
