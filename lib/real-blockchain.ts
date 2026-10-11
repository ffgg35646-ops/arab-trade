
export interface DepositVerification {
  txHash: string;
  asset: string;
  network: string;
  amount: number;
  confirmations: number;
  confirmed: boolean;
  toAddress: string;
}

function config(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name}_NOT_CONFIGURED`);
  }

  return value;
}

export async function verifyBlockchainDeposit(input: {
  txHash: string;
  asset: string;
  network: string;
  expectedAddress: string;
}): Promise<DepositVerification> {
  const base = config("BLOCKCHAIN_GATEWAY_URL");
  const key = config("BLOCKCHAIN_GATEWAY_API_KEY");

  const response = await fetch(
    `${base}/deposit/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(input),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("BLOCKCHAIN_DEPOSIT_VERIFY_FAILED");
  }

  return response.json();
}

export async function createBlockchainWithdrawal(input: {
  asset: string;
  network: string;
  address: string;
  amount: number;
}) {
  const base = config("BLOCKCHAIN_GATEWAY_URL");
  const key = config("BLOCKCHAIN_GATEWAY_API_KEY");

  const response = await fetch(
    `${base}/withdrawal/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(input),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("BLOCKCHAIN_WITHDRAWAL_FAILED");
  }

  return response.json() as Promise<{ txHash: string }>;
}

/**
 * Check the current blockchain status of a withdrawal.
 *
 * The gateway is expected to return:
 * {
 *   success: true,
 *   confirmed: boolean,
 *   txHash?: string,
 *   confirmations?: number
 * }
 */
export async function verifyBlockchainWithdrawal(input: {
  txHash: string;
  asset: string;
  network: string;
}) {
  const baseUrl =
    process.env.BLOCKCHAIN_GATEWAY_URL?.trim();

  const apiKey =
    process.env.BLOCKCHAIN_GATEWAY_API_KEY?.trim() ||
    process.env.BLOCKCHAIN_API_KEY?.trim();

  if (!baseUrl) {
    throw new Error(
      "BLOCKCHAIN_GATEWAY_URL is not configured"
    );
  }

  const response = await fetch(
    `${baseUrl}/withdrawal/status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey
          ? {
              Authorization:
                `Bearer ${apiKey}`,
            }
          : {}),
      },
      body: JSON.stringify({
        txHash: input.txHash,
        asset: input.asset,
        network: input.network,
      }),
      cache: "no-store",
    }
  );

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        `Withdrawal status gateway returned ${response.status}`
    );
  }

  return {
    success: Boolean(data?.success ?? true),
    confirmed: Boolean(data?.confirmed),
    txHash:
      typeof data?.txHash === "string"
        ? data.txHash
        : input.txHash,
    confirmations:
      Number.isFinite(
        Number(data?.confirmations)
      )
        ? Number(data.confirmations)
        : 0,
  };
}
