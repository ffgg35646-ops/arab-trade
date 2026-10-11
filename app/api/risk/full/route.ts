import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";

import MarginPosition from "@/models/MarginPosition";
import MarginLoan from "@/models/MarginLoan";
import FuturesPosition from "@/models/FuturesPosition";

import {
  calculatePnl as futuresPnl,
  calculateMaintenanceMargin,
  shouldLiquidate,
} from "@/lib/futures-engine-core";

import {
  calculateRatio,
  liquidatable,
} from "@/lib/margin-engine-core";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "غير مصرح" },
        { status: 401 }
      );
    }

    await connectDB();

    const [
      marginPositions,
      loans,
      futures,
    ] = await Promise.all([
      MarginPosition.find({
        userId: user._id,
        status: "open",
      }).lean(),

      MarginLoan.find({
        userId: user._id,
        status: "active",
      }).lean(),

      FuturesPosition.find({
        userId: user._id,
        status: "open",
      }).lean(),
    ]);

    const margin = marginPositions.map(
      (position: any) => {
        /*
         * القرض مربوط بالمركز نفسه.
         * لا نعتمد على اسم الأصل لاختيار القرض.
         */
        const loan = loans.find(
          (item: any) =>
            item.positionId &&
            String(item.positionId) ===
              String(position._id)
        );

        const pnl = futuresPnl(
          position.side,
          Number(position.entryPrice),
          Number(position.markPrice),
          Number(position.quantity)
        );

        const borrowed = Number(
          loan?.outstanding ??
            position.borrowed ??
            0
        );

        const equity =
          Number(position.margin || 0) +
          pnl -
          Number(position.interest || 0);

        const ratio = calculateRatio(
          equity,
          borrowed
        );

        return {
          id: String(position._id),
          symbol: position.symbol,
          side: position.side,
          entryPrice: Number(position.entryPrice),
          markPrice: Number(position.markPrice),
          quantity: Number(position.quantity),
          leverage: Number(position.leverage),
          margin: Number(position.margin || 0),
          borrowed,
          interest: Number(position.interest || 0),
          pnl,
          equity,
          ratio,
          liquidatable: liquidatable(
            equity,
            borrowed
          ),
        };
      }
    );

    const futuresRisk = futures.map(
      (position: any) => {
        const pnl = futuresPnl(
          position.side,
          Number(position.entryPrice),
          Number(position.markPrice),
          Number(position.quantity)
        );

        const notional =
          Number(position.markPrice) *
          Number(position.quantity);

        const maintenance =
          calculateMaintenanceMargin(
            notional
          );

        const equity =
          Number(position.margin || 0) +
          pnl;

        return {
          id: String(position._id),
          symbol: position.symbol,
          side: position.side,
          pnl,
          equity,
          maintenanceMargin: maintenance,
          liquidationPrice:
            position.liquidationPrice,
          liquidatable:
            shouldLiquidate(
              equity,
              maintenance
            ),
        };
      }
    );

    return NextResponse.json({
      margin,
      futures: futuresRisk,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "تعذر حساب المخاطر",
      },
      { status: 400 }
    );
  }
}
