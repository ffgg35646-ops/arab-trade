import AdminDataPage from "@/components/AdminDataPage";
import AdminPageFrame from "@/components/AdminPageFrame";

export default function Page() {
  return (
    <AdminPageFrame title="الصفقات">
      <AdminDataPage title="الصفقات" endpoint="/api/admin/trading" />
    </AdminPageFrame>
  );
}