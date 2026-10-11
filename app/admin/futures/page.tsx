import AdminDataPage from "@/components/AdminDataPage";
import AdminPageFrame from "@/components/AdminPageFrame";

export default function Page() {
  return (
    <AdminPageFrame title="العقود الآجلة">
      <AdminDataPage title="العقود الآجلة" endpoint="/api/admin/futures" />
    </AdminPageFrame>
  );
}