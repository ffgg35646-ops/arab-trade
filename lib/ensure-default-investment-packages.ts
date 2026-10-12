import InvestmentPackage from "@/models/InvestmentPackage";
import PackageCatalogSeed from "@/models/PackageCatalogSeed";
import UserPackage from "@/models/UserPackage";

const CATALOG_KEY = "arab-trade-default-packages-v1";

// Initial lifetime activation-price templates. Daily profit is configurable by administrators.
const DEFAULT_PACKAGES = [
  {
    name: "Bronze",
    description: "باقة تفعيل مستمرة دون انتهاء. يحدد الأدمن الربح اليومي من لوحة الإدارة.",
    price: 50,
    asset: "USDT",
    durationDays: 0,
    dailyProfit: 0,
    enabled: true,
    sortOrder: 1,
  },
  {
    name: "Silver",
    description: "باقة تفعيل مستمرة دون انتهاء. رصيد التفعيل مستقل عن رصيد السحب، والربح اليومي حسب إعداد الإدارة.",
    price: 100,
    asset: "USDT",
    durationDays: 0,
    dailyProfit: 0,
    enabled: true,
    sortOrder: 2,
  },
  {
    name: "Gold",
    description: "باقة تفعيل مستمرة دون انتهاء. يحدد الأدمن الربح اليومي من لوحة الإدارة.",
    price: 250,
    asset: "USDT",
    durationDays: 0,
    dailyProfit: 0,
    enabled: true,
    sortOrder: 3,
  },
  {
    name: "Platinum",
    description: "باقة تفعيل مستمرة دون انتهاء. الربح اليومي المحدد من الإدارة يظهر في رصيد الباقة وفق قواعد السحب.",
    price: 500,
    asset: "USDT",
    durationDays: 0,
    dailyProfit: 0,
    enabled: true,
    sortOrder: 4,
  },
];

let localSeedPromise: Promise<void> | null = null;

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Seed only an actually empty catalog; never overwrite or re-enable existing plans. */
async function seedCatalog() {
  if (await InvestmentPackage.exists({})) return;

  let ownsSeedLock = false;
  try {
    await PackageCatalogSeed.create({ key: CATALOG_KEY, status: "seeding" });
    ownsSeedLock = true;
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 11000) throw error;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await InvestmentPackage.exists({})) return;
      const state = await PackageCatalogSeed.findOne({ key: CATALOG_KEY }).lean();
      if (state?.status === "complete") return;
      await pause(100);
    }

    // Recover a lock left by a crashed process, without taking over a fresh lock.
    const cutoff = new Date(Date.now() - 5000);
    const takeover = await PackageCatalogSeed.findOneAndUpdate(
      { key: CATALOG_KEY, status: "seeding", updatedAt: { $lt: cutoff } },
      { $set: { updatedAt: new Date() } },
      { new: true },
    );
    ownsSeedLock = Boolean(takeover);
  }

  if (!ownsSeedLock) return;

  try {
    if (!(await InvestmentPackage.exists({}))) {
      await InvestmentPackage.insertMany(DEFAULT_PACKAGES, { ordered: true });
    }
    await PackageCatalogSeed.updateOne(
      { key: CATALOG_KEY },
      { $set: { status: "complete", seededAt: new Date() } },
    );
  } catch (error) {
    await PackageCatalogSeed.deleteOne({ key: CATALOG_KEY, status: "seeding" }).catch(() => {});
    throw error;
  }
}

export async function ensureDefaultInvestmentPackages() {
  if (!localSeedPromise) {
    localSeedPromise = seedCatalog().finally(() => {
      localSeedPromise = null;
    });
  }
  await localSeedPromise;

  // The platform packages are lifetime accounts. Normalize legacy catalog and
  // user-package duration values so old "60 day" records cannot imply expiry.
  const [plans, legacyAccounts] = await Promise.all([
    InvestmentPackage.find({}).select("_id durationDays description").lean(),
    UserPackage.updateMany({ durationDays: { $ne: 0 } }, { $set: { durationDays: 0 } }),
  ]);
  void legacyAccounts;

  for (const plan of plans as any[]) {
    const original = String(plan.description || "");
    const cleaned = original
      .replace(/باقة(?: بداية)? لمدة\s*\d+\s*يوم(?:ًا|اً|ا)?/gi, "باقة تفعيل مستمرة دون انتهاء")
      .replace(/لمدة\s*\d+\s*يوم(?:ًا|اً|ا)?/gi, "دون تاريخ انتهاء")
      .replace(/for\s*\d+\s*days?/gi, "with no expiry")
      .replace(/لا تُضاف أرباح تلقائية|لا يتم إنشاء أرباح يومية مضمونة تلقائيًا/g, "يُضاف الربح اليومي المحدد من الإدارة");
    if (Number(plan.durationDays || 0) !== 0 || cleaned !== original) {
      await InvestmentPackage.updateOne(
        { _id: plan._id },
        { $set: { durationDays: 0, description: cleaned } }
      );
    }
  }
}
