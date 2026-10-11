import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminLeader } from "@/lib/admin-auth";
import { connectDB } from "@/lib/mongodb";
import WithdrawalRequest from "@/models/WithdrawalRequest";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";
import { createBlockchainWithdrawal } from "@/lib/real-blockchain";

export async function POST(
  request: NextRequest
) {
  let session:
    mongoose.ClientSession | null =
    null;

  try {
    await requireAdminLeader(request);
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
            "معرف السحب مطلوب",
        },
        { status: 400 }
      );
    }

    // ----------------------------------------------------
    // Load current withdrawal
    // ----------------------------------------------------
    const withdrawal =
      await WithdrawalRequest.findById(
        id
      ).lean();

    if (!withdrawal) {
      return NextResponse.json(
        {
          success: false,
          message:
            "طلب السحب غير موجود",
        },
        { status: 404 }
      );
    }

    // Already broadcasted -> idempotent response.
    if (
      withdrawal.txHash &&
      (
        withdrawal.status ===
          "processing" ||
        withdrawal.status ===
          "completed"
      )
    ) {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        status:
          withdrawal.status,
        txHash:
          withdrawal.txHash,
        withdrawal,
      });
    }

    if (
      withdrawal.status !==
        "approved" &&
      withdrawal.status !==
        "failed"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "طلب السحب يجب أن يكون معتمدًا أولًا",
        },
        { status: 409 }
      );
    }

    // ----------------------------------------------------
    // Blockchain call OUTSIDE DB transaction.
    // If provider fails, the locked amount remains locked
    // and admin can retry safely.
    // ----------------------------------------------------
    let result:
      | { txHash: string }
      | null = null;

    try {
      result =
        await createBlockchainWithdrawal({
          asset:
            withdrawal.asset,
          network:
            withdrawal.network,
          address:
            withdrawal.address,
          amount:
            withdrawal.receiveAmount,
        });
    } catch (providerError: any) {
      await WithdrawalRequest.findByIdAndUpdate(
        withdrawal._id,
        {
          $set: {
            status: "failed",
            failedAt: new Date(),
            adminNote:
              `${withdrawal.adminNote || ""}\nBlockchain error: ${
                providerError?.message ||
                "unknown"
              }`.trim(),
          },
        }
      );

      return NextResponse.json(
        {
          success: false,
          message:
            providerError?.message ||
            "تعذر تنفيذ السحب على البلوكشين",
          retryable: true,
        },
        { status: 400 }
      );
    }

    if (!result?.txHash) {
      await WithdrawalRequest.findByIdAndUpdate(
        withdrawal._id,
        {
          $set: {
            status: "failed",
            failedAt: new Date(),
            adminNote:
              `${withdrawal.adminNote || ""}\nBlockchain provider did not return txHash`.trim(),
          },
        }
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "مزود البلوكشين لم يُرجع txHash",
          retryable: true,
        },
        { status: 400 }
      );
    }

    // ----------------------------------------------------
    // Atomic financial settlement.
    // Locked amount -> consumed once.
    // Withdrawal ledger + system fee ledger.
    // ----------------------------------------------------
    session =
      await mongoose.startSession();

    await session.withTransaction(
      async () => {
        const current =
          await WithdrawalRequest.findById(
            withdrawal._id
          ).session(session);

        if (!current) {
          throw new Error(
            "WITHDRAWAL_NOT_FOUND"
          );
        }

        if (
          current.txHash &&
          (
            current.status ===
              "processing" ||
            current.status ===
              "completed"
          )
        ) {
          return;
        }

        if (
          current.status !==
            "approved" &&
          current.status !==
            "failed"
        ) {
          throw new Error(
            "WITHDRAWAL_NOT_APPROVED"
          );
        }

        // Consume the full locked gross amount.
        const wallet =
          await Wallet.findOneAndUpdate(
            {
              userId:
                current.userId,
              type: "spot",
              mode: "live",
              balances: {
                $elemMatch: {
                  asset:
                    current.asset,
                  locked: {
                    $gte:
                      Number(
                        current.amount
                      ),
                  },
                },
              },
            },
            {
              $inc: {
                "balances.$.locked":
                  -Number(
                    current.amount
                  ),
              },
            },
            {
              new: true,
              session,
            }
          );

        if (!wallet) {
          throw new Error(
            "LOCKED_WITHDRAWAL_BALANCE_NOT_FOUND"
          );
        }

        const balance =
          wallet.balances.find(
            (item: any) =>
              String(
                item.asset
              ).toUpperCase() ===
              String(
                current.asset
              ).toUpperCase()
          );

        const balanceAfter =
          Number(
            balance?.available || 0
          );

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
              type: "withdrawal",
              amount:
                -Number(
                  current.amount
                ),
              balanceBefore:
                balanceAfter,
              balanceAfter:
                balanceAfter,
              referenceId:
                `WITHDRAWAL:${current._id}`,
              note:
                "Blockchain withdrawal broadcast",
            },
          ],
          {
            session,
          }
        );

        // The network fee portion belongs to the system.
        if (
          Number(current.fee) > 0
        ) {
          await LedgerEntry.create(
            [
              {
                scope:
                  "system",
                systemAccount:
                  "withdrawal-fees",
                asset:
                  String(
                    current.asset
                  ).toUpperCase(),
                mode: "live",
                type: "fee",
                amount:
                  Number(
                    current.fee
                  ),
                balanceBefore: 0,
                balanceAfter:
                  Number(
                    current.fee
                  ),
                referenceId:
                  `WITHDRAWAL:${current._id}`,
                note:
                  "Withdrawal fee",
              },
            ],
            {
              session,
            }
          );
        }

        current.status =
          "processing";

        current.txHash =
          result!.txHash;

        current.broadcastedAt =
          new Date();

        current.failedAt =
          undefined;

        current.adminNote =
          `${current.adminNote || ""}\nBlockchain txHash: ${result!.txHash}`.trim();

        await current.save({
          session,
        });
      }
    );

    return NextResponse.json({
      success: true,
      status: "processing",
      txHash:
        result.txHash,
      message:
        "تم إرسال السحب إلى البلوكشين وهو قيد التأكيد",
    });
  } catch (error: any) {
    console.error(
      "CREATE BLOCKCHAIN WITHDRAWAL:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "تعذر تنفيذ السحب",
      },
      { status: 400 }
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}
