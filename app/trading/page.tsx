import { redirect } from "next/navigation";

export default function TradingPage() {
  // The full trading terminal is available through the authenticated internal route.
  redirect("/protrade");
}
