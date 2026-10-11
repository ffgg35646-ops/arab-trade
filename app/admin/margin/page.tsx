import AdminDataPage from "@/components/AdminDataPage";
import AdminPageFrame from "@/components/AdminPageFrame";

export default function Page() {
  return (
    <AdminPageFrame title="الهامش">
      <AdminDataPage title="الهامش" endpoint="/api/admin/margin" />
    </AdminPageFrame>
  );
}