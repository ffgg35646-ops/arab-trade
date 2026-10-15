import mongoose from "mongoose";

// Read-only audit: this script never modifies package or withdrawal records.
// Usage:
//   MONGODB_URI="..." node scripts/audit-package-withdrawal-locks.mjs
//   AUDIT_USER_EMAIL="user@example.com" MONGODB_URI="..." node scripts/audit-package-withdrawal-locks.mjs
//
// The database name is checked intentionally so this utility cannot silently
// inspect a similarly named test/staging database or the wrong project.

const uri = process.env.MONGODB_URI || "";
const userEmail = String(process.env.AUDIT_USER_EMAIL || "").trim().toLowerCase();

if (!uri) {
  throw new Error("MONGODB_URI is required.");
}

let uriDatabase = "";
try {
  const parsed = new URL(uri);
  uriDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "");
} catch {
  throw new Error("MONGODB_URI is not a valid MongoDB connection URI.");
}

if (uriDatabase !== "arabtrade") {
  throw new Error(
    'Safety check failed: this audit only runs against a URI whose database path is exactly "arabtrade".'
  );
}

const activeStatuses = ["pending", "approved", "processing"];
const epsilon = 1e-7;
const asNumber = (value) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const idOf = (value) => value == null ? "" : String(value);

let connection;
try {
  connection = await mongoose.connect(uri, { bufferCommands: false });
  const db = connection.connection.db;
  if (!db) throw new Error("MongoDB connection opened without a database handle.");

  let userId = null;
  if (userEmail) {
    const user = await db.collection("users").findOne(
      { email: { $regex: "^" + userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", $options: "i" } },
      { projection: { _id: 1 } },
    );
    if (!user) throw new Error("No user found for AUDIT_USER_EMAIL.");
    userId = user._id;
  }

  const accountFilter = userId ? { userId } : {};
  const requestFilter = {
    source: "package",
    status: { $in: activeStatuses },
    ...(userId ? { userId } : {}),
  };

  const [accounts, activeRequests, allPackageRequests] = await Promise.all([
    db.collection("userpackages")
      .find(accountFilter)
      .project({
        _id: 1, userId: 1, packageName: 1, status: 1,
        availableEarnings: 1, lockedEarnings: 1, withdrawalRequestPending: 1,
      })
      .toArray(),
    db.collection("withdrawalrequests")
      .find(requestFilter)
      .project({
        _id: 1, userId: 1, userPackageId: 1, packageAllocations: 1,
        amount: 1, status: 1, createdAt: 1,
      })
      .sort({ createdAt: -1 })
      .toArray(),
    db.collection("withdrawalrequests")
      .find({ source: "package", ...(userId ? { userId } : {}) })
      .project({ _id: 1, userId: 1, userPackageId: 1, packageAllocations: 1, amount: 1, status: 1 })
      .toArray(),
  ]);

  const accountById = new Map(accounts.map((row) => [idOf(row._id), row]));
  const expectedLockedByAccount = new Map();
  const activeRequestIdsByAccount = new Map();
  const allocationWarnings = [];
  const missingAccountAllocations = [];

  for (const request of activeRequests) {
    const allocations = Array.isArray(request.packageAllocations) && request.packageAllocations.length
      ? request.packageAllocations
      : [{ userPackageId: request.userPackageId, amount: request.amount }];

    const allocatedTotal = allocations.reduce((sum, item) => sum + asNumber(item.amount), 0);
    if (Math.abs(allocatedTotal - asNumber(request.amount)) > epsilon) {
      allocationWarnings.push({
        requestId: idOf(request._id),
        status: request.status,
        requestAmount: asNumber(request.amount),
        allocatedTotal,
        note: "Allocation total does not match request amount; investigate before changing balances.",
      });
    }

    for (const allocation of allocations) {
      const accountId = idOf(allocation.userPackageId);
      if (!accountId) {
        missingAccountAllocations.push({
          requestId: idOf(request._id),
          note: "Active package request has an allocation without userPackageId.",
        });
        continue;
      }
      expectedLockedByAccount.set(
        accountId,
        (expectedLockedByAccount.get(accountId) || 0) + asNumber(allocation.amount),
      );
      if (!accountById.has(accountId)) {
        missingAccountAllocations.push({
          requestId: idOf(request._id),
          packageAccountId: accountId,
          note: "Active request references a package account not found in the selected account scope.",
        });
      }
      const ids = activeRequestIdsByAccount.get(accountId) || [];
      ids.push({ requestId: idOf(request._id), status: request.status, amount: asNumber(allocation.amount) });
      activeRequestIdsByAccount.set(accountId, ids);
    }

    // Legacy records can have only a primary userPackageId and no allocation array.
    const primaryId = idOf(request.userPackageId);
    if (primaryId && !allocations.some((item) => idOf(item.userPackageId) === primaryId)) {
      const ids = activeRequestIdsByAccount.get(primaryId) || [];
      ids.push({ requestId: idOf(request._id), status: request.status, amount: asNumber(request.amount) });
      activeRequestIdsByAccount.set(primaryId, ids);
    }
  }

  const discrepancies = [];
  const staleFlags = [];
  for (const account of accounts) {
    const accountId = idOf(account._id);
    const actualLocked = Math.max(0, asNumber(account.lockedEarnings));
    const expectedLocked = Math.max(0, expectedLockedByAccount.get(accountId) || 0);
    const difference = actualLocked - expectedLocked;
    const activeRequestsForAccount = activeRequestIdsByAccount.get(accountId) || [];

    if (Math.abs(difference) > epsilon) {
      discrepancies.push({
        userId: idOf(account.userId),
        packageAccountId: accountId,
        packageName: String(account.packageName || ""),
        status: String(account.status || ""),
        availableEarnings: asNumber(account.availableEarnings),
        actualLockedEarnings: actualLocked,
        expectedLockedFromActiveRequests: expectedLocked,
        excessLockedVsActiveRequests: difference > epsilon ? difference : 0,
        missingLockedVsActiveRequests: difference < -epsilon ? -difference : 0,
        activeRequests: activeRequestsForAccount,
        note: difference > epsilon
          ? "Possible orphaned lock; do not release automatically without checking request history/ledger."
          : "Active requests exceed the stored lock; do not adjust automatically.",
      });
    }

    if (account.withdrawalRequestPending === true && activeRequestsForAccount.length === 0) {
      staleFlags.push({
        userId: idOf(account.userId),
        packageAccountId: accountId,
        packageName: String(account.packageName || ""),
        note: "withdrawalRequestPending is true but no pending/approved/processing request allocation references this account.",
      });
    }
  }

  const terminalStillLocked = allPackageRequests.filter(
    (request) => ["rejected", "failed", "completed"].includes(String(request.status)),
  );
  const terminalReferences = new Set();
  for (const request of terminalStillLocked) {
    const allocations = Array.isArray(request.packageAllocations) && request.packageAllocations.length
      ? request.packageAllocations
      : [{ userPackageId: request.userPackageId, amount: request.amount }];
    for (const allocation of allocations) {
      const accountId = idOf(allocation.userPackageId);
      if (accountId) terminalReferences.add(accountId);
    }
  }

  const report = {
    mode: "read-only",
    database: "arabtrade",
    userScope: userEmail ? "AUDIT_USER_EMAIL supplied (email omitted from report)" : "all users",
    accountsChecked: accounts.length,
    activePackageRequestsChecked: activeRequests.length,
    activeStatusesUsedForExpectedLockedBalance: activeStatuses,
    mismatchCount: discrepancies.length,
    stalePendingFlagCount: staleFlags.length,
    allocationWarningCount: allocationWarnings.length,
    missingAccountAllocationCount: missingAccountAllocations.length,
    lockedBalanceDiscrepancies: discrepancies,
    stalePendingFlags: staleFlags,
    malformedActiveRequestAllocations: allocationWarnings,
    missingPackageAccountReferences: missingAccountAllocations,
    terminalRequestsByPackageAccount: [...terminalReferences].map((accountId) => {
      const account = accountById.get(accountId);
      return {
        packageAccountId: accountId,
        packageName: account ? String(account.packageName || "") : "(account not in selected scope)",
        storedLockedEarnings: account ? asNumber(account.lockedEarnings) : null,
        note: "Terminal-history reference only; the report does not assume this request caused the current lock.",
      };
    }),
    safety: "No database records were modified. Use request IDs and package ledger history before any manual balance correction.",
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  if (connection) await mongoose.disconnect();
}
