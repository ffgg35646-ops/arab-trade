import InternalDashboardLayout from "@/components/InternalDashboardLayout";

export default function ProTradeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep the terminal available as a market view; trading APIs enforce account eligibility.
  return <InternalDashboardLayout>{children}</InternalDashboardLayout>;
}
