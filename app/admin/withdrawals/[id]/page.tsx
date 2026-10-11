import AdminRequestDetail from "@/components/AdminRequestDetail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AdminRequestDetail
      title="تفاصيل طلب السحب"
      endpoint={`/api/admin/withdrawals/${id}`}
      backHref="/admin/withdrawals"
      kind="withdrawal"
    />
  );
}