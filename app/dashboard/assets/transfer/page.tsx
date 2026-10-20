import { redirect } from "next/navigation";

/** Legacy route: internal funding/spot transfers are retired. */
export default function LegacyWalletTransferPage() {
  redirect("/dashboard/assets");
}
