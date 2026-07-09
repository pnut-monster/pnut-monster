import { CustomerShell } from "./customer-shell";

export const dynamic = "force-dynamic";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CustomerShell>{children}</CustomerShell>;
}
