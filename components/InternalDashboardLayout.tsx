"use client";

import type { ReactNode } from "react";
import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import { InternalDashboardChromeContext } from "@/components/InternalDashboardChromeContext";

export default function InternalDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-[#050a13] text-white">
      <InternalNavbar />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1700px]">
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
