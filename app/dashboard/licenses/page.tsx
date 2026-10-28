import InternalNavbar from "@/components/InternalNavbar";
import InternalSidebar from "@/components/InternalSidebar";
import LicensesContent from "@/components/LicensesContent";

export default function DashboardLicensesPage() {
  return (
    <div className="min-h-screen bg-[#050a13]">
      <InternalNavbar />
      <div className="mx-auto flex max-w-[1700px]">
        <InternalSidebar />
        <div className="min-w-0 flex-1">
          <LicensesContent />
        </div>
      </div>
    </div>
  );
}
