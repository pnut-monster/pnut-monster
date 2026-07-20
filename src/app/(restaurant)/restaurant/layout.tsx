import { RestaurantShell } from "./restaurant-shell";

export default function RestaurantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestaurantShell>{children}</RestaurantShell>;
}
