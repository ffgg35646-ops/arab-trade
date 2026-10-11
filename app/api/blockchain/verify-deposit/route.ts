import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { connectDB } from "@/lib/mongodb";
import DepositRequest from "@/models/DepositRequest";
import Asset from "@/models/Asset";
import DepositBalance from "@/models/DepositBalance";
import LedgerEntry from "@/models/LedgerEntry";
import Wallet from "@/models/Wallet";
import User from "@/models/User";
import PlatformSettings from "@/models/PlatformSettings";
import ReferralCommission from "@/models/ReferralCommission";
import Notification from "@/models/Notification";
import {
  verifyBlockchainDeposit,
} from "@/lib/real-blockchain";

export async function POST(
  request: NextRequest
) {
  let session:
    mongoose.ClientSession | null =
    null;

  try {
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

    const body =
      await request.json();

    const id =
      String(
        body.id || ""
      ).trim();

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message:
            "معرف الإيداع مطلوب",
        },
        { status: 400 }
      );
    }

    const deposit =
      await DepositRequest.findOne({
        _id: id,
        userId: user._id,
      }).lean();

    if (!deposit) {
      return NextResponse.json(
        {
          success: false,
          message:
            "طلب الإيداع غير موجود",
        },
        { status: 404 }
      );
    }

    // Already credited -> idempotent response
    if (deposit.creditedAt) {
      return NextResponse.json({
        success: true,
        confirmed: true,
        credited: true,
        alreadyProcessed: true,
        amount: Number(
          deposit.amount || 0
        ),
        asset:
          String(
            deposit.asset
          ).toUpperCase(),
        network:
          String(
            deposit.network
          ).toUpperCase(),
        txHash:
          deposit.txHash,
        confirmations:
          Number(
            deposit.confirmations || 0
          ),
      });
    }

    if (!deposit.txHash) {
      return NextResponse.json(
        {
          success: false,
          message:
            "txHash مطلوب",
        },
        { status: 400 }
      );
    }

    const asset =
      await Asset.findOne({
        symbol:
          String(
            deposit.asset
          ).toUpperCase(),
        enabled: true,
        depositEnabled: true,
      }).lean();

    if (!asset) {
      return NextResponse.json(
        {
          success: false,
          message:
            "الأصل غير متاح للإيداع",
        },
        { status: 400 }
      );
    }

    const network =
      asset.networks.find(
        (item: any) =>
          String(
            item.code
          ).toUpperCase() ===
            String(
              deposit.network
            ).toUpperCase() &&
          item.enabled &&
          item.depositEnabled
      );

    if (!network) {
      return NextResponse.json(
        {
          success: false,
          message:
            "شبكة الإيداع غير متاحة",
        },
        { status: 400 }
      );
    }

    // Blockchain verification
    const result =
      await verifyBlockchainDeposit({
        txHash:
          deposit.txHash,
        asset:
          String(
            deposit.asset
          ).toUpperCase(),
        network:
          String(
            deposit.network
          ).toUpperCase(),
        expectedAddress:
          deposit.address,
      });

    const confirmations =
      Number(
        result.confirmations || 0
      );

    const requiredConfirmations =
      Math.max(
        1,
        Number(
          network.confirmations || 1
        )
      );

    const expectedAmount =
      Number(deposit.amount);

    const actualAmount =
      Number(result.amount);

    const valid =
      Boolean(
        result.confirmed
      ) &&
      confirmations >=
        requiredConfirmations &&
      Number.isFinite(
        actualAmount
      ) &&
      Math.abs(
        actualAmount -
          expectedAmount
      ) <= 1e-12 &&
      String(
        result.txHash
      ).toLowerCase() ===
        String(
          deposit.txHash
        ).toLowerCase() &&
      String(
        result.asset
      ).toUpperCase() ===
        String(
          deposit.asset
        ).toUpperCase() &&
      String(
        result.network
      ).toUpperCase() ===
        String(
          deposit.network
        ).toUpperCase() &&
      String(
        result.toAddress
      ).trim().toLowerCase() ===
        String(
          deposit.address
        ).trim().toLowerCase();

    if (!valid) {
      return NextResponse.json({
        success: false,
        confirmed: false,
        credited: false,
        confirmations,
        requiredConfirmations,
      });
    }

    // -----------------------------------------------------
    // Atomic credit
    // -----------------------------------------------------
    session =
      await mongoose.startSession();

    await session.withTransaction(
      async () => {
        const current =
          await DepositRequest.findOne({
            _id: deposit._id,
            userId: user._id,
          }).session(session);

        if (!current) {
          throw new Error(
            "DEPOSIT_NOT_FOUND"
          );
        }

        if (current.creditedAt) {
          return;
        }

        // Same txHash must not credit another deposit
        const duplicate =
          await DepositRequest.findOne({
            _id: {
              $ne: current._id,
            },
            txHash:
              current.txHash,
            creditedAt: {
              $ne: null,
            },
          })
            .session(session)
            .lean();

        if (duplicate) {
          throw new Error(
            "DUPLICATE_TXHASH"
          );
        }

        let depositBalance = await DepositBalance.findOne({
          userId: current.userId,
          asset: String(current.asset).toUpperCase(),
        }).session(session);

        if (!depositBalance) {
          depositBalance = new DepositBalance({
            userId: current.userId,
            asset: String(current.asset).toUpperCase(),
            available: 0,
            locked: 0,
          });
        }

        const before = Number(depositBalance.available || 0);
        depositBalance.available = Number((before + expectedAmount).toFixed(12));
        const after = Number(depositBalance.available || 0);
        await depositBalance.save({ session });

        await LedgerEntry.create(
          [
            {
              userId:
                current.userId,
              scope: "user",
              asset:
                String(
                  current.asset
                ).toUpperCase(),
              mode: "live",
              type: "deposit",
              amount:
                Number(
                  expectedAmount.toFixed(12)
                ),
              balanceBefore:
                Number(
                  before.toFixed(12)
                ),
              balanceAfter:
                Number(
                  after.toFixed(12)
                ),
              referenceId:
                `DEPOSIT:${current._id}`,
              note:
                "External blockchain deposit credited to separate deposit balance",
            },
          ],
          { session }
        );

        current.confirmations = confirmations;
        current.confirmedAt = new Date();
        current.creditedAt = new Date();
        current.status = "approved";
        current.adminNote = "تم التحقق من البلوكشين وإضافة الرصيد إلى رصيد الإيداع الخارجي.";

        await current.save({
          session,
        });

        // Approved on-chain deposits follow the same referral commission path as admin-approved deposits.
        const referredUser = await User.findById(current.userId).select("referredBy").session(session).lean();
        if (referredUser?.referredBy) {
          const settings = await PlatformSettings.findOne({ key: "global" }).session(session).lean();
          const enabled = settings?.referral?.enabled !== false;
          const commissionPercent = Number(settings?.referral?.commissionPercent ?? 0);

          if (enabled && Number.isFinite(commissionPercent) && commissionPercent > 0 && commissionPercent <= 100) {
            const commission = Number((expectedAmount * commissionPercent / 100).toFixed(12));
            if (commission > 0) {
              const referrerId = referredUser.referredBy;
              await ReferralCommission.create([{
                referrerId,
                referredUserId: current.userId,
                tradeId: null,
                amount: commission,
                asset: String(current.asset).toUpperCase(),
                rate: commissionPercent,
                status: "available",
              }], { session });

              let wallet = await Wallet.findOne({
                userId: referrerId,
                type: "spot",
                mode: "live",
              }).session(session);
              if (!wallet) {
                wallet = new Wallet({
                  userId: referrerId,
                  type: "spot",
                  mode: "live",
                  balances: [],
                });
              }

              const symbol = String(current.asset).toUpperCase();
              const walletBalance = wallet.balances.find((item) => String(item.asset).toUpperCase() === symbol);
              const before = Number(walletBalance?.available || 0);
              if (!walletBalance) {
                wallet.balances.push({ asset: symbol, available: commission, locked: 0 });
              } else {
                walletBalance.available = Number((before + commission).toFixed(12));
              }
              const after = before + commission;
              await wallet.save({ session });

              await LedgerEntry.create([{
                userId: referrerId,
                scope: "user",
                asset: symbol,
                mode: "live",
                type: "referral",
                amount: commission,
                balanceBefore: before,
                balanceAfter: after,
                referenceId: `DEPOSIT:${current._id}`,
                note: `عمولة إحالة ${commissionPercent}% من إيداع البلوكشين ${current.userId}`,
              }], { session });
            }
          }
        }
      }
    );

    // Notification is outside the financial transaction.
    try {
      await Notification.create({
        userId:
          user._id,
        type: "deposit",
        title:
          "تم تأكيد الإيداع",
        message:
          `تم إضافة ${expectedAmount} ${String(
            deposit.asset
          ).toUpperCase()} إلى محفظتك.`,
        read: false,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      confirmed: true,
      credited: true,
      alreadyProcessed: false,
      amount: expectedAmount,
      asset:
        String(
          deposit.asset
        ).toUpperCase(),
      network:
        String(
          deposit.network
        ).toUpperCase(),
      txHash:
        deposit.txHash,
      confirmations,
      requiredConfirmations,
    });
  } catch (error: any) {
    console.error(
      "VERIFY DEPOSIT:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر تأكيد الإيداع",
      },
      {
        status:
          error?.message ===
          "DUPLICATE_TXHASH"
            ? 409
            : 400,
      }
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}
