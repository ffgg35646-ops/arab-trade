import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const mongoose = await import("mongoose");
  const { SignJWT } = await import("jose");
  const { NextRequest } = await import("next/server");

  const { connectDB } =
    await import("@/lib/mongodb");

  const User =
    (await import("@/models/User")).default;

  const Wallet =
    (await import("@/models/Wallet")).default;

  const DepositRequest =
    (await import("@/models/DepositRequest")).default;

  const LedgerEntry =
    (await import("@/models/LedgerEntry")).default;

  const Asset =
    (await import("@/models/Asset")).default;

  await connectDB();

  const id = Date.now();

  let user: any = null;
  let deposit: any = null;

  try {
    // ----------------------------------------------------
    // User
    // ----------------------------------------------------
    user = await User.create({
      name: "Real Deposit Test",
      username: `deposit${id}`,
      email: `deposit${id}@example.com`,
      password: "Test123456",
      referralCode: `DEP${id}`,
      role: "user",
      isActive: true,
    });

    // ----------------------------------------------------
    // Asset + Network
    // ----------------------------------------------------
    await Asset.findOneAndUpdate(
      { symbol: "USDT" },
      {
        $set: {
          name: "Tether",
          symbol: "USDT",
          type: "crypto",
          enabled: true,
          depositEnabled: true,
          withdrawalEnabled: true,
          tradingEnabled: true,
          networks: [
            {
              name: "Test Network",
              code: "TEST",
              enabled: true,
              depositEnabled: true,
              withdrawalEnabled: true,
              depositAddress:
                "TEST-DEPOSIT-ADDRESS",
              confirmations: 2,
              minDeposit: 1,
              maxDeposit: 100000,
              minWithdrawal: 1,
              maxWithdrawal: 100000,
              withdrawalFee: 0,
              warning: "",
              sortOrder: 1,
            },
          ],
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    // ----------------------------------------------------
    // Live wallet starts empty
    // ----------------------------------------------------
    await Wallet.create({
      userId: user._id,
      type: "spot",
      mode: "live",
      balances: [
        {
          asset: "USDT",
          available: 0,
          locked: 0,
        },
      ],
    });

    // ----------------------------------------------------
    // Pending deposit
    // ----------------------------------------------------
    deposit =
      await DepositRequest.create({
        userId: user._id,
        asset: "USDT",
        network: "TEST",
        amount: 100,
        address:
          "TEST-DEPOSIT-ADDRESS",
        txHash:
          `0xtestdeposit${id}`,
        status: "pending",
      });

    // ----------------------------------------------------
    // JWT exactly like current-user.ts expects
    // ----------------------------------------------------
    const secretText =
      process.env.AUTH_SECRET;

    if (!secretText) {
      throw new Error(
        "AUTH_SECRET is not configured"
      );
    }

    const token =
      await new SignJWT({
        userId: String(user._id),
      })
        .setProtectedHeader({
          alg: "HS256",
          typ: "JWT",
        })
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(
          new TextEncoder().encode(
            secretText
          )
        );

    // ----------------------------------------------------
    // Mock Blockchain Gateway
    // ----------------------------------------------------
    const originalFetch =
      globalThis.fetch;

    globalThis.fetch =
      async () =>
        new Response(
          JSON.stringify({
            txHash:
              `0xtestdeposit${id}`,
            asset: "USDT",
            network: "TEST",
            amount: 100,
            confirmations: 2,
            confirmed: true,
            toAddress:
              "TEST-DEPOSIT-ADDRESS",
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );

    try {
      // Fake gateway configuration for the test only.
    process.env.BLOCKCHAIN_GATEWAY_URL =
      "http://test-blockchain-gateway";
    process.env.BLOCKCHAIN_GATEWAY_API_KEY =
      "test-key";

    const { POST } =
      await import(
        "@/app/api/blockchain/verify-deposit/route"
      );

      function makeRequest() {
        return new NextRequest(
          "http://localhost/api/blockchain/verify-deposit",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Cookie:
                `arabtrade_session=${token}`,
            },
            body: JSON.stringify({
              id: String(
                deposit._id
              ),
            }),
          }
        );
      }

      // --------------------------------------------------
      // Two simultaneous verification requests
      // --------------------------------------------------
      const [response1, response2] =
        await Promise.all([
          POST(makeRequest()),
          POST(makeRequest()),
        ]);

      const result1 =
        await response1.json();

      const result2 =
        await response2.json();

      console.log("");
      console.log(
        "===== REAL DEPOSIT STEP 6 TEST ====="
      );

      console.log(
        "Response 1:",
        response1.status,
        result1
      );

      console.log(
        "Response 2:",
        response2.status,
        result2
      );

      // --------------------------------------------------
      // Verify wallet
      // --------------------------------------------------
      const wallet =
        await Wallet.findOne({
          userId: user._id,
          type: "spot",
          mode: "live",
        }).lean();

      const usdt =
        wallet?.balances?.find(
          (x: any) =>
            x.asset === "USDT"
        );

      console.log(
        "USDT available:",
        usdt?.available
      );

      // --------------------------------------------------
      // Verify ledger
      // --------------------------------------------------
      const ledger =
        await LedgerEntry.find({
          userId: user._id,
          type: "deposit",
          asset: "USDT",
          mode: "live",
          referenceId:
            `DEPOSIT:${deposit._id}`,
        }).lean();

      console.log(
        "Deposit ledger entries:",
        ledger.length
      );

      // --------------------------------------------------
      // Verify deposit status
      // --------------------------------------------------
      const finalDeposit =
        await DepositRequest.findById(
          deposit._id
        ).lean();

      console.log(
        "Credited:",
        Boolean(
          finalDeposit?.creditedAt
        )
      );

      console.log(
        "Confirmations:",
        finalDeposit?.confirmations
      );

      // --------------------------------------------------
      // PASS
      // --------------------------------------------------
      const pass =
        Number(
          usdt?.available
        ) === 100 &&
        ledger.length === 1 &&
        Boolean(
          finalDeposit?.creditedAt
        ) &&
        Number(
          finalDeposit?.confirmations
        ) === 2;

      if (!pass) {
        throw new Error(
          "REAL_DEPOSIT_STEP6_TEST_FAILED"
        );
      }

      console.log("");
      console.log(
        "✅ REAL DEPOSIT STEP 6 TEST PASSED"
      );
      console.log(
        "✅ Blockchain verification passed"
      );
      console.log(
        "✅ Wallet credited exactly once"
      );
      console.log(
        "✅ Deposit ledger created exactly once"
      );
      console.log(
        "✅ Confirmation count stored"
      );
      console.log(
        "✅ Concurrent duplicate verification did not double-credit"
      );
    } finally {
      globalThis.fetch =
        originalFetch;
    }
  } finally {
    // ----------------------------------------------------
    // Cleanup
    // ----------------------------------------------------
    if (deposit?._id) {
      await DepositRequest.deleteOne({
        _id: deposit._id,
      });
    }

    if (user?._id) {
      await LedgerEntry.deleteMany({
        userId: user._id,
      });

      await Wallet.deleteMany({
        userId: user._id,
      });

      await User.deleteOne({
        _id: user._id,
      });
    }

    await mongoose.disconnect();
  }
}

main().catch(
  async (error) => {
    console.error(
      "❌ REAL DEPOSIT TEST ERROR:",
      error
    );

    try {
      const mongoose =
        await import("mongoose");
      await mongoose.disconnect();
    } catch {}

    process.exit(1);
  }
);
