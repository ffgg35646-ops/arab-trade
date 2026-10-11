import fs from "node:fs";
import path from "node:path";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf-8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      !trimmed.includes("=")
    ) {
      continue;
    }

    const index = trimmed.indexOf("=");

    const key = trimmed
      .slice(0, index)
      .trim();

    let value = trimmed
      .slice(index + 1)
      .trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const BASE_URL =
  process.env.MARGIN_MONITOR_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const INTERVAL_MS = Number(
  process.env.MARGIN_MONITOR_INTERVAL_MS || 5000
);

async function runMonitor() {
  try {
    const secret = process.env.MARGIN_MONITOR_SECRET || "";

    if (!secret) {
      console.error(
        "[margin-monitor] MARGIN_MONITOR_SECRET غير موجود."
      );
      return;
    }

    const response = await fetch(
      `${BASE_URL}/api/margin/monitor`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "x-margin-monitor-secret": secret,
        },
      }
    );

    const text = await response.text();

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      console.error(
        "[margin-monitor] HTTP",
        response.status,
        data
      );
      return;
    }

    console.log(
      `[margin-monitor] checked=${data.checked ?? 0} ` +
      `liquidated=${data.liquidated ?? 0} ` +
      `insuranceUsed=${data.insuranceUsed ?? 0} ` +
      `badDebt=${data.badDebt ?? 0}`
    );
  } catch (error) {
    console.error(
      "[margin-monitor] request failed:",
      error instanceof Error
        ? error.message
        : error
    );
  }
}

async function main() {
  console.log(
    `[margin-monitor] started: ${BASE_URL}/api/margin/monitor`
  );
  console.log(
    `[margin-monitor] interval: ${INTERVAL_MS}ms`
  );

  await runMonitor();

  setInterval(() => {
    void runMonitor();
  }, INTERVAL_MS);
}

void main();
