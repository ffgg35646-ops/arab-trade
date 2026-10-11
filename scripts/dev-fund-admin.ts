import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Wallet from "@/models/Wallet";
import LedgerEntry from "@/models/LedgerEntry";

async function main() {
  await connectDB();

  const email = process.env.ADMIN_LEADER_EMAIL;
  if (!email) throw new Error("ADMIN_LEADER_EMAIL غير موجود");

  const user = await User.findOne({ email }).select("_id email role");

  if (!user) throw new Error("حساب الأدمن غير موجود");

  if (user.role !== "admin_leader") {
    throw new Error("الحساب ليس admin_leader");
  }

  const wallet =
    (await Wallet.findOne({ userId: user._id, type: "spot" })) ||
    new Wallet({
      userId: user._id,
      type: "spot",
      balances: [],
    });

  let balance = wallet.balances.find(
    (b: any) => String(b.asset).toUpperCase() === "USDT"
  );

  if (!balance) {
    wallet.balances.push({
      asset: "USDT",
      available: 1000,
      locked: 0,
    });

    await wallet.save();

    await LedgerEntry.create({
      userId: user._id,
      asset: "USDT",
      type: "adjustment",
      amount: 1000,
      balanceBefore: 0,
      balanceAfter: 1000,
      referenceId: "DEV_TEST_BALANCE",
      note: "رصيد تطوير محلي للاختبار فقط",
    });
  } else {
    const before = Number(balance.available || 0);
    balance.available += 1000;

    await wallet.save();

    await LedgerEntry.create({
      userId: user._id,
      asset: "USDT",
      type: "adjustment",
      amount: 1000,
      balanceBefore: before,
      balanceAfter: balance.available,
      referenceId: "DEV_TEST_BALANCE",
      note: "رصيد تطوير محلي للاختبار فقط",
    });
  }

  console.log("تمت إضافة 1000 USDT كرصد تطوير محلي للأدمن.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});