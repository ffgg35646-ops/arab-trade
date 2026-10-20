import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/current-user";
import Trade from "@/models/Trade";
import Order from "@/models/Order";

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, message: "غير مسجل الدخول" }, { status: 401 });
    }

    await connectDB();

    const url = new URL(request.url);
    const requestedPeriod = String(url.searchParams.get("period") || "30");
    const period = ["7", "30", "90", "all"].includes(requestedPeriod) ? requestedPeriod : "30";
    const from = period === "all" ? null : new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000);
    const dateFilter = from ? { createdAt: { $gte: from } } : {};
    const tradeFilter: {
      mode: "live";
      $or: Array<{ buyerId?: typeof user._id; sellerId?: typeof user._id }>;
      createdAt?: { $gte: Date };
    } = {
      mode: "live",
      $or: [{ buyerId: user._id }, { sellerId: user._id }],
      ...(from ? { createdAt: { $gte: from } } : {}),
    };

    const commonPipeline = [
      { $match: tradeFilter },
      {
        $addFields: {
          isCurrentUserBuyer: { $eq: ["$buyerId", user._id] },
          quoteValue: {
            $ifNull: [
              "$quoteAmount",
              { $multiply: [{ $ifNull: ["$quantity", 0] }, { $ifNull: ["$price", 0] }] },
            ],
          },
          userSide: { $cond: [{ $eq: ["$buyerId", user._id] }, "buy", "sell"] },
          userFee: {
            $cond: [
              { $eq: ["$buyerId", user._id] },
              { $ifNull: ["$feeBuyer", 0] },
              { $ifNull: ["$feeSeller", 0] },
            ],
          },
          userFeeAsset: {
            $cond: [
              { $eq: ["$buyerId", user._id] },
              { $ifNull: ["$buyerFeeAsset", "USDT"] },
              { $ifNull: ["$sellerFeeAsset", "USDT"] },
            ],
          },
        },
      },
    ];

    const [summaryRows, feeRows, recentRows, completedOrders] = await Promise.all([
      Trade.aggregate([
        ...commonPipeline,
        {
          $group: {
            _id: null,
            tradeCount: { $sum: 1 },
            volume: { $sum: "$quoteValue" },
            buys: { $sum: { $cond: [{ $eq: ["$userSide", "buy"] }, "$quoteValue", 0] } },
            sells: { $sum: { $cond: [{ $eq: ["$userSide", "sell"] }, "$quoteValue", 0] } },
          },
        },
      ]),
      Trade.aggregate([
        ...commonPipeline,
        { $match: { $expr: { $gt: ["$userFee", 0] } } },
        {
          $group: {
            _id: { $toUpper: { $ifNull: ["$userFeeAsset", "USDT"] } },
            total: { $sum: "$userFee" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
      Trade.find(tradeFilter)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Order.countDocuments({
        userId: user._id,
        mode: "live",
        ...dateFilter,
        $or: [
          { status: "filled" },
          { filledQuantity: { $gt: 0 } },
        ],
      }),
    ]);

    const summary = summaryRows[0] || {
      tradeCount: 0,
      volume: 0,
      buys: 0,
      sells: 0,
    };

    const trades = recentRows.map((trade: any) => {
      const isBuyer = String(trade.buyerId) === String(user._id);
      const fee = n(isBuyer ? trade.feeBuyer : trade.feeSeller);
      const feeAsset = String((isBuyer ? trade.buyerFeeAsset : trade.sellerFeeAsset) || "USDT").toUpperCase();
      return {
        _id: String(trade._id),
        symbol: String(trade.symbol || ""),
        side: isBuyer ? "buy" : "sell",
        role: isBuyer ? "buyer" : "seller",
        price: n(trade.price),
        quantity: n(trade.quantity),
        quoteQuantity: n(trade.quoteAmount) || n(trade.quantity) * n(trade.price),
        fee,
        feeAsset,
        createdAt: trade.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      period,
      from: from ? from.toISOString() : null,
      summary: {
        tradeCount: n(summary.tradeCount),
        volume: n(summary.volume),
        buys: n(summary.buys),
        sells: n(summary.sells),
        completedOrders: n(completedOrders),
      },
      feesByAsset: feeRows.map((row: any) => ({
        asset: String(row._id || "USDT").toUpperCase(),
        total: n(row.total),
        count: n(row.count),
      })),
      trades,
      notes: {
        tradeMetricsArePeriodBound: true,
        feeTotalsAreSeparatedByAsset: true,
        recentTradesLimit: 100,
      },
    });
  } catch (error) {
    console.error("ACCOUNT FINANCIAL REPORTS ERROR:", error);
    return NextResponse.json(
      { success: false, message: "تعذر تحميل التقارير المالية" },
      { status: 500 }
    );
  }
}
