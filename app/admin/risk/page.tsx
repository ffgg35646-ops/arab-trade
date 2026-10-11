import AdminDataPage from "@/components/AdminDataPage";
import AdminPageFrame from "@/components/AdminPageFrame";

export default function Page() {
  return (
    <AdminPageFrame title="إدارة المخاطر">
      <AdminDataPage title="إدارة المخاطر" endpoint="/api/admin/risk" />
    </AdminPageFrame>
  );
}