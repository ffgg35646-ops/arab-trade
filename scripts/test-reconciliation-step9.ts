import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { connectDB } =
    await import("@/lib/mongodb");

  const { runReconciliation } =
    await import("@/lib/reconciliation");

  await connectDB();

  console.log("\n===== STEP 9 RECONCILIATION TEST =====\n");

  const result =
    await runReconciliation();

  console.log(
    "Checked at:",
    result.checkedAt
  );

  console.log("\nSummary:");
  console.log(
    JSON.stringify(
      result.summary,
      null,
      2
    )
  );

  console.log("\nIssues:");

  if (result.issues.length === 0) {
    console.log(
      "✅ No reconciliation issues found"
    );
  } else {
    console.log(
      JSON.stringify(
        result.issues,
        null,
        2
      )
    );
  }

  console.log("\nResult:");

  if (result.ok) {
    console.log(
      "✅ RECONCILIATION TEST PASSED"
    );
    process.exit(0);
  }

  console.log(
    "❌ RECONCILIATION FOUND ERRORS"
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(
    "\n❌ RECONCILIATION TEST FAILED\n",
    error
  );
  process.exit(1);
});
