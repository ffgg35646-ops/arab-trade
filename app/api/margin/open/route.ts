import { getMarketLastPrice } from "@/lib/market-price";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { requireVerifiedIdentity } from "@/lib/require-kyc";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import { migrateLegacyDepositBalancesToSpotWallet } from "@/lib/unified-usdt-wallet";

import Wallet from "@/models/Wallet";
import MarginLoan from "@/models/MarginLoan";
import MarginPosition from "@/models/MarginPosition";
import PlatformSettings from "@/models/PlatformSettings";
import { writeLedger } from "@/lib/ledger";

export async function POST(
  request: NextRequest
) {
  try {
    const kyc = await requireVerifiedIdentity(
      request
    );

    if (!kyc.ok) {
      return NextResponse.json(
        {
          success: false,
          message: kyc.message,
        },
        {
          status: kyc.status,
        }
      );
    }

    const user =
      await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "غير مصرح",
        },
        { status: 401 }
      );
    }

    await connectDB();
    await migrateLegacyDepositBalancesToSpotWallet(user._id);

    const platformSettings =
      await PlatformSettings.findOne({
        key: "global",
      }).lean();

    const marginInterestRatePercent =
      Number(
        platformSettings?.trading?.marginInterestRatePercent ?? 0
      );

    const body =
      await request.json().catch(
        () => ({})
      );

    const symbol =
      String(body.symbol || "")
        .trim()
        .toUpperCase();

    const side =
      String(body.side || "")
        .trim()
        .toLowerCase();

    const margin =
      Number(body.margin);

    const leverage =
      Number(body.leverage);

    if (
      !symbol ||
      !["long", "short"].includes(side)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "بيانات الصفقة غير صحيحة",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(margin) ||
      margin <= 0 ||
      !Number.isFinite(leverage) ||
      leverage < 1 ||
      leverage > 125
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "الهامش أو الرافعة غير صحيحة",
        },
        { status: 400 }
      );
    }

    const entryPrice = await getMarketLastPrice(symbol);

    if (
      !Number.isFinite(entryPrice) ||
      entryPrice <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "سعر الأصل غير متاح حاليًا",
        },
        { status: 400 }
      );
    }

    const notional =
      margin * leverage;

    const quantity =
      notional / entryPrice;

    if (
      !Number.isFinite(notional) ||
      !Number.isFinite(quantity) ||
      notional <= 0 ||
      quantity <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "تعذر حساب المركز",
        },
        { status: 400 }
      );
    }

    const session =
      await mongoose.startSession();

    let result: any = null;

    try {
      await session.withTransaction(
        async () => {
          const existing =
            await MarginPosition.findOne(
              {
                userId: user._id,
                symbol,
                status: "open",
              },
              null,
              { session }
            );

          if (existing) {
            throw new Error(
              "توجد صفقة مارجن مفتوحة على هذا الزوج"
            );
          }

          const wallet =
            await Wallet.findOne(
              {
                userId: user._id,
                type: "spot",
              },
              null,
              { session }
            );

          if (!wallet) {
            throw new Error(
              "المحفظة غير موجودة"
            );
          }

          const usdt =
            wallet.balances.find(
              (item: any) =>
                String(
                  item.asset || ""
                ).toUpperCase() === "USDT"
            );

          if (
            !usdt ||
            Number(usdt.available || 0) <
              margin
          ) {
            throw new Error(
              "رصيد USDT غير كافٍ"
            );
          }

          /*
           * الضمان يصبح محجوزًا اقتصاديًا
           * بخصمه من available.
           */
          usdt.available =
            Number(usdt.available || 0) -
            margin;

          /*
           * في Long:
           * القرض يعبر عن الجزء الممول
           * بالرافعة.
           *
           * في Short:
           * القرض يعبر عن الأصل
           * المباع على المكشوف.
           */
          const borrowed =
            side === "long"
              ? Math.max(
                  0,
                  notional - margin
                )
              : quantity;

          const loanAsset =
            side === "long"
              ? "USDT"
              : symbol;

          const positions =
            await MarginPosition.create(
              [
                {
                  userId: user._id,
                  symbol,
                  side,
                  quantity,
                  entryPrice,
                  markPrice: entryPrice,
                  leverage,
                  margin,
                  borrowed,
                  interest: 0,
                  pnl: 0,
                  status: "open",
                },
              ],
              { session }
            );

          const position =
            positions[0];

          const loans =
            await MarginLoan.create(
              [
                {
                  userId: user._id,
                  positionId:
                    position._id,
                  asset: loanAsset,
                  amount: borrowed,
                  outstanding: borrowed,
                  interestRate:
                    marginInterestRatePercent,
                  accruedInterest: 0,
                  badDebt: 0,
                  status: "active",
                },
              ],
              { session }
            );

          await wallet.save({
            session,
          });

          await writeLedger(
            user._id,
            "USDT",
            "margin_open",
            -margin,
            Number(usdt.available || 0) + margin,
            Number(usdt.available || 0),
            String(position._id),
            "فتح مركز مارجن وحجز الهامش",
            session
          );

          result = {
            position,
            loan: loans[0],
          };
        }
      );
    } finally {
      await session.endSession();
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "تم فتح صفقة المارجن",
        position:
          result.position,
        loan:
          result.loan,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر فتح صفقة المارجن",
      },
      { status: 400 }
    );
  }
}
