import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const mongoose = (await import("mongoose")).default;
  const { connectDB } = await import("@/lib/mongodb");
  const Wallet = (await import("@/models/Wallet")).default;
  const Transfer = (await import("@/models/Transfer")).default;
  const LedgerEntry = (await import("@/models/LedgerEntry")).default;
  const { executeInternalWalletTransfer } = await import("@/lib/internal-wallet-transfer");

  await connectDB();

  const userId = new mongoose.Types.ObjectId();
  let session: any = null;

  try {
    await Wallet.create({
      userId,
      type: "spot",
      mode: "live",
      balances: [{ asset: "USDT", available: 50, locked: 10 }],
    });

    session = await mongoose.startSession();
    let result: any = null;
    await session.withTransaction(async () => {
      result = await executeInternalWalletTransfer({
        userId,
        asset: "USDT",
        amount: 12.5,
        from: "spot",
        to: "funding",
        session,
      });
    });

    const [spot, funding, transfer, ledger] = await Promise.all([
      Wallet.findOne({ userId, type: "spot", mode: "live" }).lean(),
      Wallet.findOne({ userId, type: "funding", mode: "live" }).lean(),
      Transfer.find({ userId }).lean(),
      LedgerEntry.find({ userId, referenceId: `TRANSFER:${result.id}` }).lean(),
    ]);

    const findBalance = (wallet: any, code: string) =>
      wallet?.balances?.find((row: any) => row.asset === code) ?? { available: 0, locked: 0 };

    const sourceBalance = findBalance(spot, "USDT");
    const destinationBalance = findBalance(funding, "USDT");
    const signedLedgerAmount = ledger.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);

    const passed =
      result?.status === "completed" &&
      result?.amount === 12.5 &&
      sourceBalance.available === 37.5 &&
      sourceBalance.locked === 10 &&
      destinationBalance.available === 12.5 &&
      destinationBalance.locked === 0 &&
      transfer.length === 1 &&
      ledger.length === 2 &&
      ledger.some((row: any) => Number(row.amount) === -12.5) &&
      ledger.some((row: any) => Number(row.amount) === 12.5) &&
      Math.abs(signedLedgerAmount) < 1e-10;

    if (!passed) {
      console.error({ result, sourceBalance, destinationBalance, transfers: transfer.length, ledger });
      throw new Error("TRANSFER_SETTLEMENT_ASSERTION_FAILED");
    }

    let insufficientFailed = false;
    try {
      await session.withTransaction(async () => {
        await executeInternalWalletTransfer({
          userId,
          asset: "USDT",
          amount: 100,
          from: "spot",
          to: "funding",
          session,
        });
      });
    } catch (error: any) {
      insufficientFailed = error?.message === "INSUFFICIENT_TRANSFER_BALANCE";
    }

    const [spotAfterFailure, fundingAfterFailure, transferCount, ledgerCount] = await Promise.all([
      Wallet.findOne({ userId, type: "spot", mode: "live" }).lean(),
      Wallet.findOne({ userId, type: "funding", mode: "live" }).lean(),
      Transfer.countDocuments({ userId }),
      LedgerEntry.countDocuments({ userId, referenceId: `TRANSFER:${result.id}` }),
    ]);

    if (
      !insufficientFailed ||
      findBalance(spotAfterFailure, "USDT").available !== 37.5 ||
      findBalance(fundingAfterFailure, "USDT").available !== 12.5 ||
      transferCount !== 1 ||
      ledgerCount !== 2
    ) {
      throw new Error("FAILED_TRANSFER_MUST_ROLL_BACK");
    }

    console.log("✅ INTERNAL TRANSFER ATOMICITY TEST PASSED");
    console.log("✅ Source and destination balances updated together");
    console.log("✅ Both signed ledger entries and transfer record committed");
    console.log("✅ Insufficient balance rolled back with no partial writes");
  } finally {
    if (session) await session.endSession();
    await Promise.all([
      Wallet.deleteMany({ userId }),
      Transfer.deleteMany({ userId }),
      LedgerEntry.deleteMany({ userId }),
    ]);
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error("❌ INTERNAL TRANSFER ATOMICITY TEST FAILED", error);
  try {
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
