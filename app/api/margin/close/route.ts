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

import {
  calculatePnl,
} from "@/lib/risk-engine";

import {
  calculateInterest,
} from "@/lib/margin-engine-core";

import { writeLedger } from "@/lib/ledger";

export async function POST(
  request: NextRequest
) {
  try {
    const kyc =
      await requireVerifiedIdentity(
        request
      );

    if (!kyc.ok) {
      return NextResponse.json(
        {
          success: false,
          message: kyc.message,
        },
        { status: kyc.status }
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

    const body =
      await request.json().catch(
        () => ({})
      );

    const id =
      String(body.id || "").trim();

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message:
            "معرف المركز مطلوب",
        },
        { status: 400 }
      );
    }

    const position =
      await MarginPosition.findOne({
        _id: id,
        userId: user._id,
        status: "open",
      });

    if (!position) {
      return NextResponse.json(
        {
          success: false,
          message:
            "المركز غير موجود أو مغلق",
        },
        { status: 404 }
      );
    }

    const exitPrice = await getMarketLastPrice(
      position.symbol
    );

    if (
      !Number.isFinite(exitPrice) ||
      exitPrice <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "سعر الإغلاق غير صحيح",
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
          const lockedPosition =
            await MarginPosition.findOne(
              {
                _id: id,
                userId: user._id,
                status: "open",
              },
              null,
              {
                session,
              }
            );

          if (!lockedPosition) {
            throw new Error(
              "المركز غير موجود أو أغلق بالفعل"
            );
          }

          const loan =
            await MarginLoan.findOne(
              {
                positionId:
                  lockedPosition._id,
                userId: user._id,
                status: "active",
              },
              null,
              {
                session,
              }
            );

          const pnl =
            calculatePnl(
              lockedPosition.side,
              Number(
                lockedPosition.entryPrice
              ),
              exitPrice,
              Number(
                lockedPosition.quantity
              )
            );

          let interest = 0;

          if (loan) {
            const createdAt =
              loan.createdAt
                ? new Date(
                    loan.createdAt
                  ).getTime()
                : Date.now();

            const elapsedHours =
              Math.max(
                0,
                (Date.now() -
                  createdAt) /
                  3600000
              );

            interest =
              calculateInterest(
                Number(
                  loan.outstanding || 0
                ),
                Number(
                  loan.interestRate || 0
                ),
                elapsedHours
              );

            loan.accruedInterest =
              interest;
          }

          const equity =
            Number(
              lockedPosition.margin || 0
            ) +
            pnl -
            interest;

          const settlement =
            Math.max(0, equity);

          const wallet =
            await Wallet.findOne(
              {
                userId: user._id,
                type: "spot",
              },
              null,
              {
                session,
              }
            );

          if (!wallet) {
            throw new Error(
              "المحفظة غير موجودة"
            );
          }

          let usdt =
            wallet.balances.find(
              (item: any) =>
                String(
                  item.asset || ""
                ).toUpperCase() ===
                "USDT"
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

          usdt.available =
            Number(
              usdt.available || 0
            ) + settlement;

          lockedPosition.markPrice =
            exitPrice;

          lockedPosition.pnl =
            pnl;

          lockedPosition.interest =
            interest;

          lockedPosition.status =
            "closed";

          if (loan) {
            loan.outstanding = 0;
            loan.status = "repaid";
            await loan.save({
              session,
            });
          }

          await wallet.save({
            session,
          });

          await lockedPosition.save({
            session,
          });

          if (settlement > 0) {
            const balanceAfter =
              Number(usdt.available || 0);

            const balanceBefore =
              balanceAfter - settlement;

            await writeLedger(
              user._id,
              "USDT",
              "margin_close",
              settlement,
              balanceBefore,
              balanceAfter,
              String(lockedPosition._id),
              "تسوية إغلاق مركز مارجن",
              session
            );
          }

          result = {
            pnl,
            interest,
            settlement,
            position:
              lockedPosition,
          };
        }
      );
    } finally {
      await session.endSession();
    }

    return NextResponse.json({
      success: true,
      message:
        "تم إغلاق صفقة المارجن",
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر إغلاق صفقة المارجن",
      },
      { status: 400 }
    );
  }
}
