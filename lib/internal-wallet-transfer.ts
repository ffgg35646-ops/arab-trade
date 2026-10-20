import mongoose from "mongoose";
import Wallet from "@/models/Wallet";
import Transfer from "@/models/Transfer";
import LedgerEntry from "@/models/LedgerEntry";

export type InternalWalletType = "spot" | "funding";

export type InternalTransferResult = {
  id: string;
  asset: string;
  amount: number;
  from: InternalWalletType;
  to: InternalWalletType;
  status: "completed";
  createdAt: Date;
};

/**
 * Performs the balance movement, transfer record, and signed ledger entries
 * in the caller's MongoDB transaction. The caller must commit/abort the session.
 */
export async function executeInternalWalletTransfer(input: {
  userId: mongoose.Types.ObjectId;
  asset: string;
  amount: number;
  from: InternalWalletType;
  to: InternalWalletType;
  session: mongoose.ClientSession;
}): Promise<InternalTransferResult> {
  const { userId, from, to, session } = input;
  const asset = String(input.asset || "").trim().toUpperCase();
  const amount = Number(input.amount);

  if (!session.inTransaction()) {
    throw new Error("TRANSFER_TRANSACTION_REQUIRED");
  }
  if (
    !asset ||
    !["spot", "funding"].includes(from) ||
    !["spot", "funding"].includes(to) ||
    from === to ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error("INVALID_TRANSFER_INPUT");
  }

  const source = await Wallet.findOneAndUpdate(
    {
      userId,
      type: from,
      mode: "live",
      balances: {
        $elemMatch: {
          asset,
          available: { $gte: amount },
        },
      },
    },
    {
      $inc: {
        "balances.$.available": -amount,
      },
    },
    { new: true, session }
  );

  if (!source) {
    throw new Error("INSUFFICIENT_TRANSFER_BALANCE");
  }

  const sourceBalance = source.balances.find(
    (row) => String(row.asset).toUpperCase() === asset
  );
  if (!sourceBalance) {
    throw new Error("TRANSFER_SOURCE_BALANCE_NOT_FOUND");
  }

  const sourceAfter = Number(sourceBalance.available || 0);
  const sourceBefore = Number((sourceAfter + amount).toFixed(12));

  let destination = await Wallet.findOne({
    userId,
    type: to,
    mode: "live",
  }).session(session);

  if (!destination) {
    destination = new Wallet({
      userId,
      type: to,
      mode: "live",
      balances: [],
    });
  }

  const destinationBalance = destination.balances.find(
    (row) => String(row.asset).toUpperCase() === asset
  );
  const destinationBefore = Number(destinationBalance?.available || 0);
  const destinationAfter = Number((destinationBefore + amount).toFixed(12));

  if (destinationBalance) {
    destinationBalance.available = destinationAfter;
  } else {
    destination.balances.push({
      asset,
      available: amount,
      locked: 0,
    });
  }

  await destination.save({ session });

  const [transfer] = await Transfer.create(
    [
      {
        userId,
        asset,
        amount,
        from,
        to,
        status: "completed",
      },
    ],
    { session }
  );

  const referenceId = `TRANSFER:${String(transfer._id)}`;
  await LedgerEntry.create(
    [
      {
        userId,
        scope: "user",
        asset,
        mode: "live",
        type: "transfer",
        amount: Number((-amount).toFixed(12)),
        balanceBefore: sourceBefore,
        balanceAfter: sourceAfter,
        referenceId,
        note: `تحويل داخلي من محفظة ${from === "spot" ? "التداول" : "التمويل"} إلى محفظة ${to === "spot" ? "التداول" : "التمويل"}`,
      },
      {
        userId,
        scope: "user",
        asset,
        mode: "live",
        type: "transfer",
        amount: Number(amount.toFixed(12)),
        balanceBefore: destinationBefore,
        balanceAfter: destinationAfter,
        referenceId,
        note: `استلام تحويل داخلي في محفظة ${to === "spot" ? "التداول" : "التمويل"}`,
      },
    ],
    { session, ordered: true }
  );

  return {
    id: String(transfer._id),
    asset,
    amount: Number(amount.toFixed(12)),
    from,
    to,
    status: "completed",
    createdAt: transfer.createdAt ?? new Date(),
  };
}
