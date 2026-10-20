import { redirect } from "next/navigation";

export default function TradesPage() {
  redirect("/protrade?tab=trades");
}
