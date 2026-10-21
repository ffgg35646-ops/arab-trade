"use client";

import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";

/**
 * Persistent account chrome: route changes replace page content only. Shared
 * wallet, withdrawal and notification refreshes continue in the background.
 */
export default function DashboardWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <InternalNavbar />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1700px] min-w-0">
        <InternalSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
