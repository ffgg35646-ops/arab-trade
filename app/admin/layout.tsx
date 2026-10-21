import AdminWorkspace from "@/components/AdminWorkspace";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
