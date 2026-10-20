export default function ProTradeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The trading terminal and public market data are viewable without an account.
  // Trading APIs independently require an authenticated, eligible user.
  return children;
}
