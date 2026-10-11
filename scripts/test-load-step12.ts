
import http from "node:http";

const TARGET =
  process.env.LOAD_TEST_URL ||
  "http://127.0.0.1:3000/api/health";

const TOTAL = 100;

function requestOnce(index: number) {
  return new Promise<{
    index: number;
    ok: boolean;
    status: number;
    ms: number;
    error?: string;
  }>((resolve) => {
    const started = performance.now();

    const req = http.get(TARGET, (res) => {
      res.resume();

      res.on("end", () => {
        resolve({
          index,
          ok:
            (res.statusCode || 0) >= 200 &&
            (res.statusCode || 0) < 300,
          status: res.statusCode || 0,
          ms: performance.now() - started,
        });
      });
    });

    req.on("error", (error) => {
      resolve({
        index,
        ok: false,
        status: 0,
        ms: performance.now() - started,
        error: error.message,
      });
    });

    req.setTimeout(30000, () => {
      req.destroy();

      resolve({
        index,
        ok: false,
        status: 0,
        ms: performance.now() - started,
        error: "request timeout",
      });
    });
  });
}

async function main() {
  console.log("\n===== STEP 12 LOAD TEST =====");
  console.log(`Target: ${TARGET}`);
  console.log(`Concurrent requests: ${TOTAL}\n`);

  const started = performance.now();

  const results = await Promise.all(
    Array.from(
      { length: TOTAL },
      (_, index) => requestOnce(index + 1)
    )
  );

  const totalMs = performance.now() - started;

  const successful = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  const times = results
    .map((r) => r.ms)
    .sort((a, b) => a - b);

  const avg =
    times.reduce((sum, value) => sum + value, 0) /
    times.length;

  const p50 =
    times[Math.floor(times.length * 0.5)] || 0;

  const p95 =
    times[Math.min(
      times.length - 1,
      Math.floor(times.length * 0.95)
    )] || 0;

  const p99 =
    times[Math.min(
      times.length - 1,
      Math.floor(times.length * 0.99)
    )] || 0;

  console.log(
    `Total time: ${totalMs.toFixed(2)} ms`
  );
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Average: ${avg.toFixed(2)} ms`);
  console.log(`P50: ${p50.toFixed(2)} ms`);
  console.log(`P95: ${p95.toFixed(2)} ms`);
  console.log(`P99: ${p99.toFixed(2)} ms`);

  if (failed.length > 0) {
    console.log("\nFailed requests:");

    for (const item of failed.slice(0, 20)) {
      console.log(
        `#${item.index} status=${item.status} ${item.error || ""}`
      );
    }

    console.log("\n❌ LOAD TEST FAILED");
    process.exit(1);
  }

  console.log("\n✅ 100 CONCURRENT REQUESTS PASSED");
  process.exit(0);
}

main().catch((error) => {
  console.error("\n❌ LOAD TEST FAILED\n", error);
  process.exit(1);
});
