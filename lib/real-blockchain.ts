
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
