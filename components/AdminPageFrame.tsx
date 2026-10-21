"use client";

export default function AdminPageFrame({
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // The persistent AdminWorkspace in app/admin/layout.tsx owns the shell.
  // Keep this wrapper for existing pages without remounting navigation.
  return <>{children}</>;
}
