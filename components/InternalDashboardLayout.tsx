"use client";

import type { ReactNode } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { InternalDashboardChromeContext } from "@/components/InternalDashboardChromeContext";

export default function InternalDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="equiti-dashboard-shell min-h-screen bg-[#e5e7e8] text-white">
      <InternalNavbar />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-[1700px]">
        <InternalSidebar />
        <div className="min-w-0 flex-1">
          <InternalDashboardChromeContext.Provider value={true}>
            {children}
          </InternalDashboardChromeContext.Provider>
        </div>
      </div>
    </div>
  );
}
