import { connectDB } from "@/lib/mongodb";
import PlatformSettings from "@/models/PlatformSettings";

export async function getPlatformSettings() {
  await connectDB();

  let settings = await PlatformSettings.findOne({ key: "global" });

  if (!settings) {
    settings = await PlatformSettings.create({ key: "global" });
  }

  return settings;
}