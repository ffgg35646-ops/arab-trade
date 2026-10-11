import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { connectDB } =
    await import("@/lib/mongodb");

  const AuditLog =
    (await import("@/models/AuditLog")).default;

  const {
    evaluateAdminRisk,
  } = await import("@/lib/admin-risk");

  await connectDB();

  console.log("\n===== STEP 11 ADMIN + AUDIT + RISK TEST =====\n");

  const low =
    evaluateAdminRisk("user_status_change");

  if (
    !low.allowed ||
    low.level !== "medium"
  ) {
    throw new Error(
      "Medium-risk decision failed"
    );
  }

  console.log(
    "✅ Medium-risk action accepted"
  );

  const high =
    evaluateAdminRisk(
      "withdrawal_approve",
      { amount: 1000 }
    );

  if (
    !high.allowed ||
    high.level !== "high"
  ) {
    throw new Error(
      "High-risk decision failed"
    );
  }

  console.log(
    "✅ High-risk action accepted"
  );

  const invalid =
    evaluateAdminRisk(
      "manual_balance_change",
      { amount: -1 }
    );

  if (
    invalid.allowed ||
    invalid.level !== "critical"
  ) {
    throw new Error(
      "Invalid financial amount was not blocked"
    );
  }

  console.log(
    "✅ Invalid financial amount blocked"
  );

  const critical =
    evaluateAdminRisk(
      "manual_balance_change",
      { amount: 2_000_000 }
    );

  if (
    critical.allowed ||
    critical.level !== "critical"
  ) {
    throw new Error(
      "Critical amount was not blocked"
    );
  }

  console.log(
    "✅ Critical amount blocked"
  );

  const before =
    await AuditLog.countDocuments({
      action: "STEP11_TEST",
    });

  await AuditLog.create({
    action: "STEP11_TEST",
    resource: "security",
    resourceId: "step11-test",
    actorRole: "admin_leader",
    metadata: {
      test: true,
    },
  });

  const after =
    await AuditLog.countDocuments({
      action: "STEP11_TEST",
    });

  if (after !== before + 1) {
    throw new Error(
      "Audit log was not persisted"
    );
  }

  console.log(
    "✅ Audit log persisted"
  );

  await AuditLog.deleteMany({
    action: "STEP11_TEST",
    resourceId: "step11-test",
  });

  console.log(
    "✅ Test audit records cleaned"
  );

  console.log(
    "\n✅ STEP 11 ADMIN + AUDIT + RISK TEST PASSED"
  );

  process.exit(0);
}

main().catch((error) => {
  console.error(
    "\n❌ STEP 11 TEST FAILED\n",
    error
  );
  process.exit(1);
});
