import InvestmentPackage from "@/models/InvestmentPackage";
import PackageCatalogSeed from "@/models/PackageCatalogSeed";

const CATALOG_KEY = "arab-trade-default-packages-v1";

// Initial, editable activation-price templates. No automated earnings are created.
const DEFAULT_PACKAGES = [
  {
    name: "Bronze",
    description: "باقة بداية لمدة 60 يومًا. لا تُضاف أرباح تلقائية؛ تُسجل الإدارة العوائد التي تحققت فعليًا فقط. يمكن تعديل السعر والتفاصيل من لوحة الإدارة.",
    price: 50,
    asset: "USDT",
    durationDays: 60,
    enabled: true,
    sortOrder: 1,
  },
  {
    name: "Silver",
    description: "باقة لمدة 60 يومًا. رصيد التفعيل مستقل عن رصيد السحب، ولا تُضاف أرباح تلقائية. يمكن تعديل السعر والتفاصيل من لوحة الإدارة.",
    price: 100,
    asset: "USDT",
    durationDays: 60,
    enabled: true,
    sortOrder: 2,
  },
  {
    name: "Gold",
    description: "باقة لمدة 60 يومًا. تُعرض العوائد المحققة المسجلة فعليًا فقط، ويمكن تعديل السعر والتفاصيل من لوحة الإدارة.",
    price: 250,
    asset: "USDT",
    durationDays: 60,
    enabled: true,
    sortOrder: 3,
  },
  {
    name: "Platinum",
    description: "باقة لمدة 60 يومًا. لا يوجد ضمان أو إنشاء تلقائي للأرباح؛ تظل الأرصدة خاضعة لسجل الحركات وقواعد السحب.",
    price: 500,
    asset: "USDT",
    durationDays: 60,
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
}
