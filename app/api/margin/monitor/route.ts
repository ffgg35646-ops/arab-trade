import { getMarketLastPrice } from "@/lib/market-price";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectDB } from "@/lib/mongodb";
import MarginPosition from "@/models/MarginPosition";
import MarginLoan from "@/models/MarginLoan";
import InsuranceFund from "@/models/InsuranceFund";
import Wallet from "@/models/Wallet";
import PlatformSettings from "@/models/PlatformSettings";
import { calculatePnl } from "@/lib/risk-engine";
import { calculateInterest, liquidatable } from "@/lib/margin-engine-core";
import { writeLedger, writeSystemLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-margin-monitor-secret");

    if (
      !process.env.MARGIN_MONITOR_SECRET ||
      secret !== process.env.MARGIN_MONITOR_SECRET
    ) {
      return NextResponse.json(
        { success: false, message: "غير مصرح" },
        { status: 401 }
      );
    }

    await connectDB();

    const settings = await PlatformSettings.findOne({
      key: "global",
    }).lean();

    const liquidationFeePercent = Number(
      settings?.trading?.liquidationFeePercent ?? 0.5
    );

    const positions = await MarginPosition.find({
      status: "open",
    })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();

    let checked = 0;
    let liquidated = 0;
    let insuranceUsed = 0;
    let badDebt = 0;

    for (const candidate of positions) {
      checked++;

      const symbol = String(candidate.symbol || "").toUpperCase();

      let markPrice: number;

      try {
        markPrice = await getMarketLastPrice(symbol);
      } catch {
        continue;
      }

      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const position = await MarginPosition.findOne(
            {
              _id: candidate._id,
              status: "open",
            },
            null,
            { session }
          );

          if (!position) {
            return;
          }

          const loan = await MarginLoan.findOne(
            {
              positionId: position._id,
              status: "active",
            },
            null,
            { session }
          );

          const pnl = calculatePnl(
            position.side,
            Number(position.entryPrice),
            markPrice,
            Number(position.quantity)
          );

          let interest = 0;

          if (loan) {
            const createdAt = loan.createdAt
              ? new Date(loan.createdAt).getTime()
              : Date.now();

            const elapsedHours = Math.max(
              0,
              (Date.now() - createdAt) / 3600000
            );

            interest = calculateInterest(
              Number(loan.outstanding || 0),
              Number(loan.interestRate || 0),
              elapsedHours
            );

            loan.accruedInterest = interest;
          }

          const equity =
            Number(position.margin || 0) +
            pnl -
            interest;

          const borrowed = Number(
            loan?.outstanding ??
              position.borrowed ??
              0
          );

          if (!liquidatable(equity, borrowed)) {
            position.markPrice = markPrice;
            position.pnl = pnl;
            position.interest = interest;

            if (loan) {
              await loan.save({ session });
            }

            await position.save({ session });
            return;
          }

          const notional = Math.max(
            0,
            markPrice * Number(position.quantity || 0)
          );

          const rawFee =
            notional * (liquidationFeePercent / 100);

          const fee = Number(
            Math.min(
              Math.max(0, equity),
              Math.max(0, rawFee)
            ).toFixed(12)
          );

          const postFeeEquity = Number(
            (equity - fee).toFixed(12)
          );

          const userSettlement = Math.max(
            0,
            postFeeEquity
          );

          const liquidationBadDebt = Math.max(
            0,
            -postFeeEquity
          );

          const wallet = await Wallet.findOne(
            {
              userId: position.userId,
              type: "spot",
            },
            null,
            { session }
          );

          if (!wallet) {
            throw new Error("المحفظة غير موجودة");
          }

          let usdt = wallet.balances.find(
            (item: any) =>
              String(item.asset || "").toUpperCase() === "USDT"
          );

          if (!usdt) {
            wallet.balances.push({
              asset: "USDT",
              available: 0,
              locked: 0,
            });

            usdt =
              wallet.balances[
                wallet.balances.length - 1
              ] as any;
          }

          if (!usdt) {
            throw new Error(
              "تعذر إنشاء رصيد USDT"
            );
          }

          const walletBefore = Number(
            usdt.available || 0
          );

          if (userSettlement > 0) {
            usdt.available =
              walletBefore + userSettlement;
          }

          /*
           * رسوم التصفية تدخل صندوق التأمين.
           */
          let fund = await InsuranceFund.findOne(
            { asset: "USDT" },
            null,
            { session }
          );

          if (!fund) {
            fund = new InsuranceFund({
              asset: "USDT",
              balance: 0,
              totalFunded: 0,
              totalUsed: 0,
            });
          }

          const fundBefore = Number(fund.balance || 0);

          if (fee > 0) {
            fund.balance =
              fundBefore + fee;

            fund.totalFunded =
              Number(fund.totalFunded || 0) + fee;

            await writeSystemLedger(
              "USDT",
              "insurance_fund_credit",
              fee,
              fundBefore,
              fundBefore + fee,
              "insurance_fund",
              String(position._id),
              "رسوم تصفية مركز مارجن",
              session
            );
          }

          /*
           * الصندوق يغطي العجز فقط.
           */
          const covered = Math.min(
            fund.balance,
            liquidationBadDebt
          );

          const remainingBadDebt = Math.max(
            0,
            liquidationBadDebt - covered
          );

          if (covered > 0) {
            const beforeUse = Number(fund.balance);

            fund.balance =
              beforeUse - covered;

            fund.totalUsed =
              Number(fund.totalUsed || 0) + covered;

            await writeSystemLedger(
              "USDT",
              "insurance_fund_debit",
              -covered,
              beforeUse,
              fund.balance,
              "insurance_fund",
              String(position._id),
              "تغطية عجز تصفية مارجن",
              session
            );
          }

          if (liquidationBadDebt > 0) {
            await writeSystemLedger(
              "USDT",
              "bad_debt",
              -remainingBadDebt,
              0,
              -remainingBadDebt,
              "margin_bad_debt",
              String(position._id),
              "عجز متبقٍ بعد تغطية صندوق التأمين",
              session
            );
          }

          await fund.save({ session });

          if (userSettlement > 0) {
            await writeLedger(
              position.userId,
              "USDT",
              "margin_liquidation",
              userSettlement,
              walletBefore,
              Number(usdt.available),
              String(position._id),
              "تسوية مركز مارجن تمت تصفيته",
              session
            );
          }

          position.markPrice = markPrice;
          position.pnl = pnl;
          position.interest = interest;
          position.status = "liquidated";

          if (loan) {
            loan.outstanding = 0;
            loan.accruedInterest = interest;
            loan.badDebt = remainingBadDebt;
            loan.status = "liquidated";

            await loan.save({ session });
          }

          await wallet.save({ session });
          await position.save({ session });

          liquidated++;
          insuranceUsed += covered;
          badDebt += remainingBadDebt;
        });
      } finally {
        await session.endSession();
      }
    }

    return NextResponse.json({
      success: true,
      checked,
      liquidated,
      insuranceUsed: Number(insuranceUsed.toFixed(12)),
      badDebt: Number(badDebt.toFixed(12)),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر تشغيل مراقب التصفية",
      },
      { status: 500 }
    );
  }
}
