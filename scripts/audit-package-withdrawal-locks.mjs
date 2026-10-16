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

const activeStatuses = ["pending", "processing"];
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
        _id: 1, userId: 1, packageId: 1, packageName: 1, status: 1,
        investedAmount: 1, cancellationRefund: 1, totalRealizedEarnings: 1, totalWithdrawn: 1,
        withdrawablePrincipalCredited: 1,
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
      .project({
        _id: 1, userId: 1, userPackageId: 1, packageAllocations: 1, amount: 1, status: 1,
        isFirstPackageWithdrawal: 1, packageBalanceSettled: 1, createdAt: 1, updatedAt: 1,
      })
      .toArray(),
  ]);

  const accountById = new Map(accounts.map((row) => [idOf(row._id), row]));
  const relevantAccountIds = accounts.map((row) => row._id);
  const packageLedgerRows = relevantAccountIds.length
    ? await db.collection("packageledgers")
        .find({ userPackageId: { $in: relevantAccountIds }, ...(userId ? { userId } : {}) })
        .project({ _id: 1, userId: 1, userPackageId: 1, type: 1, asset: 1, amount: 1, note: 1, createdAt: 1 })
        .sort({ createdAt: 1, _id: 1 })
        .limit(50000)
        .toArray()
    : [];
  const ledgerByAccount = new Map();
  for (const row of packageLedgerRows) {
    const accountId = idOf(row.userPackageId);
    const rows = ledgerByAccount.get(accountId) || [];
    rows.push(row);
    ledgerByAccount.set(accountId, rows);
  }
  const requestsByAccount = new Map();
  for (const request of allPackageRequests) {
    const allocations = Array.isArray(request.packageAllocations) && request.packageAllocations.length
      ? request.packageAllocations
      : [{ userPackageId: request.userPackageId, amount: request.amount }];
    for (const allocation of allocations) {
      const accountId = idOf(allocation.userPackageId);
      if (!accountId || !accountById.has(accountId)) continue;
      const rows = requestsByAccount.get(accountId) || [];
      rows.push({
        requestId: idOf(request._id),
        status: String(request.status || ""),
        amount: asNumber(allocation.amount),
        requestAmount: asNumber(request.amount),
        isFirstPackageWithdrawal: request.isFirstPackageWithdrawal === true,
        packageBalanceSettled: request.packageBalanceSettled === true,
        createdAt: request.createdAt || null,
        updatedAt: request.updatedAt || null,
      });
      requestsByAccount.set(accountId, rows);
    }
  }
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
        note: "withdrawalRequestPending is true but no pending/processing package request allocation references this account.",
      });
    }
  }

  const terminalStillLocked = allPackageRequests.filter(
    (request) => ["approved", "rejected", "failed", "completed"].includes(String(request.status)),
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

  // Compare the stored bucket with posted package-ledger movements and request history.
  // This report never mutates balances. "ledgerExpectedBucket" excludes activation
  // debits because those are funded from the separate deposit wallet, not the package bucket.
  const bucketLedgerTypes = new Set([
    "activation_withdrawable", "realized_earning", "daily_earning", "reward",
    "cancellation_refund", "refund_reclassification", "withdrawal", "withdrawal_reversal",
  ]);
  const terminalWithdrawalStatuses = new Set(["approved", "completed"]);
  const packageBalanceAudit = accounts.map((account) => {
    const accountId = idOf(account._id);
    const ledger = ledgerByAccount.get(accountId) || [];
    const movements = ledger.filter((row) => bucketLedgerTypes.has(String(row.type || "")));
    const ledgerExpectedBucket = movements.reduce((sum, row) => sum + asNumber(row.amount), 0);
    const available = asNumber(account.availableEarnings);
    const locked = asNumber(account.lockedEarnings);
    const storedBucket = available + locked;
    const accountRequests = requestsByAccount.get(accountId) || [];
    const statusSummary = {};
    for (const request of accountRequests) {
      const key = request.status || "(missing status)";
      if (!statusSummary[key]) statusSummary[key] = { count: 0, amount: 0, requestIds: [] };
      statusSummary[key].count += 1;
      statusSummary[key].amount = Number((statusSummary[key].amount + request.amount).toFixed(8));
      statusSummary[key].requestIds.push(request.requestId);
    }
    const successfulWithdrawalAmount = accountRequests
      .filter((request) => terminalWithdrawalStatuses.has(request.status))
      .reduce((sum, request) => sum + request.amount, 0);
    const ledgerWithdrawalDebits = movements
      .filter((row) => row.type === "withdrawal" && asNumber(row.amount) < 0)
      .reduce((sum, row) => sum + Math.abs(asNumber(row.amount)), 0);
    const ledgerReversalCredits = movements
      .filter((row) => row.type === "withdrawal_reversal")
      .reduce((sum, row) => sum + asNumber(row.amount), 0);
    return {
      userId: idOf(account.userId),
      packageAccountId: accountId,
      packageId: idOf(account.packageId),
      packageName: String(account.packageName || ""),
      packageStatus: String(account.status || ""),
      withdrawablePrincipalCredited: account.withdrawablePrincipalCredited === true,
      investedAmount: asNumber(account.investedAmount),
      cancellationRefund: asNumber(account.cancellationRefund),
      totalRealizedEarnings: asNumber(account.totalRealizedEarnings),
      totalWithdrawnField: asNumber(account.totalWithdrawn),
      storedAvailable: available,
      storedLocked: locked,
      storedBucketTotal: storedBucket,
      ledgerExpectedBucket: Number(ledgerExpectedBucket.toFixed(8)),
      storedMinusLedger: Number((storedBucket - ledgerExpectedBucket).toFixed(8)),
      successfulRequestAmountApprovedOrCompleted: Number(successfulWithdrawalAmount.toFixed(8)),
      ledgerWithdrawalDebits: Number(ledgerWithdrawalDebits.toFixed(8)),
      ledgerWithdrawalReversalCredits: Number(ledgerReversalCredits.toFixed(8)),
      requestStatusSummary: statusSummary,
      recentLedgerMovements: ledger.slice(-40).map((row) => ({
        id: idOf(row._id),
        type: String(row.type || ""),
        amount: asNumber(row.amount),
        asset: String(row.asset || ""),
        createdAt: row.createdAt || null,
        note: String(row.note || "").slice(0, 240),
      })),
    };
  });
  const totals = packageBalanceAudit.reduce((sum, row) => ({
    accounts: sum.accounts + 1,
    storedAvailable: sum.storedAvailable + row.storedAvailable,
    storedLocked: sum.storedLocked + row.storedLocked,
    storedBucketTotal: sum.storedBucketTotal + row.storedBucketTotal,
    ledgerExpectedBucket: sum.ledgerExpectedBucket + row.ledgerExpectedBucket,
    successfulRequestAmountApprovedOrCompleted: sum.successfulRequestAmountApprovedOrCompleted + row.successfulRequestAmountApprovedOrCompleted,
    ledgerWithdrawalDebits: sum.ledgerWithdrawalDebits + row.ledgerWithdrawalDebits,
  }), {
    accounts: 0, storedAvailable: 0, storedLocked: 0, storedBucketTotal: 0,
    ledgerExpectedBucket: 0, successfulRequestAmountApprovedOrCompleted: 0, ledgerWithdrawalDebits: 0,
  });
  for (const key of Object.keys(totals)) {
    if (key !== "accounts") totals[key] = Number(totals[key].toFixed(8));
  }

  const report = {
    mode: "read-only",
    database: "arabtrade",
    userScope: userEmail ? "AUDIT_USER_EMAIL supplied (email omitted from report)" : "all users",
    accountsChecked: accounts.length,
    activePackageRequestsChecked: activeRequests.length,
    packageBalanceAuditTotals: totals,
    packageBalanceAudit,
    packageLedgerRowsChecked: packageLedgerRows.length,
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
