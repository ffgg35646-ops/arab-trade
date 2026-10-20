import { redirect } from "next/navigation";

export default async function ProTradePairRedirect({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const symbol = String(pair || "").trim().toUpperCase().replace(/[_/\s-]/g, "");
  if (!/^[A-Z0-9]{5,25}$/.test(symbol)) redirect("/protrade");
  redirect("/protrade?symbol=" + encodeURIComponent(symbol));
}
