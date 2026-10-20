import { redirect } from "next/navigation";

// Trading opens the complete Spot terminal directly; no intermediate sales/menu screen.
export default function TradingPage() {
  redirect("/trading/spot");
}
