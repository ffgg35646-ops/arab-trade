import AdminDataPage from "@/components/AdminDataPage";
import AdminPageFrame from "@/components/AdminPageFrame";

export default function Page() {
  return (
    <AdminPageFrame title="السجلات">
      <AdminDataPage title="السجلات" endpoint="/api/admin/audit" />
    </AdminPageFrame>
  );
}