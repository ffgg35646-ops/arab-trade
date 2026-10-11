import fs from "fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../lib/mongodb";
import User from "../models/User";

const envPath = ".env.local";
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  const email = process.env.ADMIN_LEADER_EMAIL;
  const password = process.env.ADMIN_LEADER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "ADMIN_LEADER_EMAIL and ADMIN_LEADER_PASSWORD must be configured in .env.local"
    );
  }

  if (password.length < 12) {
    throw new Error("ADMIN_LEADER_PASSWORD must be at least 12 characters");
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await User.findOne({
    $or: [
      { email: email.toLowerCase().trim() },
      { role: "admin_leader" },
    ],
  });

  if (existing) {
    existing.email = email.toLowerCase().trim();
    existing.password = passwordHash;
    existing.role = "admin_leader";
    existing.isActive = true;
    existing.isVerified = true;
    await existing.save();

    console.log("Admin Leader updated.");
    await mongoose.disconnect();
    return;
  }

  const baseUsername =
    email.toLowerCase().split("@")[0].replace(/[^a-z0-9_]/g, "_").slice(0, 24) ||
    "admin_leader";

  const username =
    baseUsername.length >= 3
      ? baseUsername
      : `admin_${Date.now().toString().slice(-8)}`;

  const referralCode = `ADMIN${Date.now().toString().slice(-8)}`;

  await User.create({
    name: "Admin Leader",
    username,
    email: email.toLowerCase().trim(),
    password: passwordHash,
    role: "admin_leader",
    referralCode,
    isVerified: true,
    isActive: true,
  });

  console.log("Admin Leader created.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("ADMIN SEED ERROR:", error);
  await mongoose.disconnect();
  process.exit(1);
});