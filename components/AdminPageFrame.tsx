"use client";

import AdminGuard from "@/components/AdminGuard";
import AdminShell from "@/components/AdminShell";

export default function AdminPageFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <AdminShell title={title}>{children}</AdminShell>
    </AdminGuard>
  );
}