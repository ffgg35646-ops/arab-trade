import mongoose from "mongoose";

import WithdrawalRequest from "@/models/WithdrawalRequest";
import Wallet from "@/models/Wallet";
import { verifyBlockchainWithdrawal } from "@/lib/real-blockchain";

const MAX_BATCH = 100;

export async function watchPendingWithdrawals() {
  const withdrawals =
    await WithdrawalRequest.find({
      status: "processing",
      txHash: {
        $exists: true,
        $ne: "",
      },
    })
      .sort({ broadcastedAt: 1 })
      .limit(MAX_BATCH);

  let checked = 0;
  let completed = 0;
  let stillProcessing = 0;
  let failed = 0;

  for (const withdrawal of withdrawals) {
    checked += 1;

    try {
      const status =
        await verifyBlockchainWithdrawal({
          txHash: String(withdrawal.txHash),
          asset: withdrawal.asset,
          network: withdrawal.network,
        });

      if (!status.confirmed) {
        stillProcessing += 1;

        await WithdrawalRequest.updateOne(
          { _id: withdrawal._id, status: "processing" },
          {
            $set: {
              txHash: status.txHash,
              adminNote:
                `${withdrawal.adminNote || ""}`.trim() +
                `\nconfirmations=${status.confirmations}`,
            },
          }
        );

        continue;
      }

      const session =
        await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          const current =
            await WithdrawalRequest.findOne({
              _id: withdrawal._id,
              status: "processing",
            }).session(session);

          if (!current) {
            return;
          }

          current.status = "completed";
          current.completedAt = new Date();
          current.txHash =
            status.txHash ||
            current.txHash ||
            undefined;

          current.adminNote =
            `${current.adminNote || ""}`.trim() +
            `\nconfirmed confirmations=${status.confirmations}`;

          await current.save({ session });        });

        completed += 1;
      } finally {
        await session.endSession();
      }
    } catch (error) {
      failed += 1;

      console.error(
        "[BLOCKCHAIN_WATCHER] withdrawal check failed:",
        {
          withdrawalId: String(withdrawal._id),
          error:
            error instanceof Error
              ? error.message
              : error,
        }
      );
    }
  }

  return {
    checked,
    completed,
    stillProcessing,
    failed,
  };
}
