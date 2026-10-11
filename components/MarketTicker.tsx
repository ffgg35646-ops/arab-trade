const markets = [
  ["BTC", "118,240.42", "+2.43%", true],
  ["ETH", "4,521.88", "+1.87%", true],
  ["SOL", "201.74", "-0.64%", false],
  ["BNB", "712.30", "+1.12%", true],
  ["XRP", "2.74", "+3.28%", true],
  ["ADA", "0.91", "-0.42%", false],
  ["DOGE", "0.24", "+0.83%", true],
  ["AVAX", "28.64", "+2.16%", true],
];

export default function MarketTicker() {
  const items = [...markets, ...markets];

  return (
    <section className="overflow-hidden border-y border-white/5 bg-[#050a13]/90">
      <div className="ticker-track flex w-max min-w-full">
        {items.map(([symbol, price, change, positive], index) => (
          <div
            key={`${symbol}-${index}`}
            className="flex min-w-[190px] items-center gap-4 border-l border-white/5 px-6 py-4"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#07101d]/[0.05] text-[10px] font-black text-white/80">
              {symbol}
            </div>

            <div>
              <div className="text-xs font-bold text-white">{symbol}/USDT</div>
              <div className="mt-0.5 text-[11px] text-white/35">${price}</div>
            </div>

            <div
              className={`mr-auto text-xs font-bold ${
                positive ? "text-[#22c55e]" : "text-[#ef4444]"
              }`}
            >
              {change}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}