import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

function exists(file: string) {
  return fs.existsSync(
    path.join(process.cwd(), file)
  );
}

function envConfigured(name: string) {
  return Boolean(
    process.env[name]?.trim()
  );
}

async function main() {
  console.log(
    "\n===== STEP 13 PRODUCTION READINESS =====\n"
  );

  const requiredEnv = [
    "MONGODB_URI",
    "AUTH_SECRET",
  ];

  const infrastructureEnv = [
    "BLOCKCHAIN_GATEWAY_URL",
    "BLOCKCHAIN_GATEWAY_API_KEY",
    "CRON_SECRET",
  ];

  let failed = false;

  console.log("=== REQUIRED ENVIRONMENT ===");

  for (const name of requiredEnv) {
    if (envConfigured(name)) {
      console.log(`✅ ${name}`);
    } else {
      console.log(`❌ ${name} is missing`);
      failed = true;
    }
  }

  console.log("\n=== INFRASTRUCTURE ENVIRONMENT ===");

  for (const name of infrastructureEnv) {
    if (envConfigured(name)) {
      console.log(`✅ ${name}`);
    } else {
      console.log(`⚠️ ${name} is not configured`);
    }
  }

  console.log("\n=== IMPORTANT FILES ===");

  const files = [
    "package.json",
    "lib/mongodb.ts",
    "lib/admin-auth.ts",
    "lib/current-user.ts",
    "lib/blockchain-watchers.ts",
    "app/api/blockchain/watch-withdrawals/route.ts",
    "app/api/blockchain/create-withdrawal/route.ts",
    "app/api/blockchain/verify-deposit/route.ts",
    "app/api/orders/route.ts",
    "lib/matching-engine.ts",
    "lib/reconciliation.ts",
    "lib/audit-log.ts",
    "lib/admin-risk.ts",
  ];

  for (const file of files) {
    if (exists(file)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file}`);
      failed = true;
    }
  }

  console.log("\n=== PACKAGE SCRIPTS ===");

  const packageJson =
    JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "package.json"
        ),
        "utf8"
      )
    );

  if (packageJson.scripts?.build) {
    console.log("✅ build script");
  } else {
    console.log("❌ build script missing");
    failed = true;
  }

  if (packageJson.scripts?.start) {
    console.log("✅ start script");
  } else {
    console.log("❌ start script missing");
    failed = true;
  }

  console.log("\n=== LOCAL ENV ===");

  if (exists(".env.local")) {
    console.log("✅ .env.local exists");
  } else {
    console.log("⚠️ .env.local not found");
  }

  console.log("\n=== RESULT ===");

  if (failed) {
    console.log(
      "❌ REQUIRED PRODUCTION CHECKS FAILED"
    );
    process.exit(1);
  }

  console.log(
    "✅ REQUIRED PRODUCTION CHECKS PASSED"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ PRODUCTION READINESS CHECK FAILED\n",
    error
  );
  process.exit(1);
});
