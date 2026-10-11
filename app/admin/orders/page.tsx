import AdminDataPage from "@/components/AdminDataPage";
import AdminPageFrame from "@/components/AdminPageFrame";

export default function Page() {
  return (
    <AdminPageFrame title="الطلبات">
      <AdminDataPage title="الطلبات" endpoint="/api/admin/orders" />
    </AdminPageFrame>
  );
}