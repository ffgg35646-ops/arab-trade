import { connectDB } from "../lib/mongodb";
import User from "../models/User";

function generateId() {
  return Math.floor(10000000 + Math.random() * 90000000);
}

async function main() {
  await connectDB();

  const used = new Set<number>();

  const existing = await User.find({
    role: "user",
    arabTradeId: { $exists: true, $ne: null },
  })
    .select("arabTradeId")
    .lean();

  for (const user of existing as any[]) {
    if (typeof user.arabTradeId === "number") {
      used.add(user.arabTradeId);
    }
  }

  const users = await User.find({
    role: "user",
    $or: [
      { arabTradeId: { $exists: false } },
      { arabTradeId: null },
    ],
  })
    .select("_id")
    .lean();

  let assigned = 0;

  for (const user of users) {
    let id = generateId();

    while (used.has(id)) {
      id = generateId();
    }

    used.add(id);

    await User.updateOne(
      { _id: user._id },
      { $set: { arabTradeId: id } }
    );

    assigned++;
  }

  await User.collection.createIndex(
    { arabTradeId: 1 },
    { unique: true, sparse: true }
  );

  console.log(`NORMAL USERS ASSIGNED: ${assigned}`);
  console.log("ARABTRADE ID INDEX: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});