// Run locally with ADMIN_TEST_PASSWORD and USER_TEST_PASSWORD set in the environment.
import fs from "node:fs";
import crypto from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      const value = match[2].trim();
      process.env[match[1]] = value.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const accounts = [
  { name: "Test Admin", username: "admin2", email: "admin2@arabtrade.com", role: "admin_leader", password: process.env.ADMIN_TEST_PASSWORD },
  { name: "Test User", username: "user2", email: "user2@arabtrade.com", role: "user", password: process.env.USER_TEST_PASSWORD },
];

async function main() {
  if (!process.env.MONGODB_URI) throw Error("MONGODB_URI is missing");
  for (const a of accounts) {
    if (!a.password || a.password.length < 8) throw Error(a.role + " password must be at least 8 characters");
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const users = mongoose.connection.collection("users");
  for (const a of accounts) {
    const conflict = await users.findOne({ $or: [{ email: a.email }, { username: a.username }] });
    if (conflict) {
      const sameDedicatedAccount =
        String(conflict.email || "").toLowerCase() === a.email &&
        String(conflict.username || "").toLowerCase() === a.username;
      if (!sameDedicatedAccount) {
        throw Error("Email or username already belongs to a different account: " + a.email);
      }
      await users.updateOne(
        { _id: conflict._id },
        { $set: {
          name: a.name,
          username: a.username,
          email: a.email,
          password: await bcrypt.hash(a.password, 12),
          role: a.role,
          isVerified: true,
          isActive: true,
          updatedAt: new Date()
        } }
      );
      console.log("UPDATED:", a.email, "role:", a.role);
      continue;
    }
    let arabTradeId, referralCode;
    do { arabTradeId = crypto.randomInt(10000000, 100000000); } while (await users.findOne({ arabTradeId }));
    do { referralCode = crypto.randomBytes(6).toString("hex").toUpperCase(); } while (await users.findOne({ referralCode }));
    await users.insertOne({
      arabTradeId, name: a.name, username: a.username, email: a.email,
      password: await bcrypt.hash(a.password, 12), role: a.role, referralCode,
      referredBy: null, isVerified: true, isActive: true, createdAt: new Date(), updatedAt: new Date()
    });
    console.log("CREATED:", a.email, "role:", a.role);
  }
  await mongoose.disconnect();
}
main().catch(async error => { console.error(error.message); await mongoose.disconnect(); process.exitCode = 1; });
