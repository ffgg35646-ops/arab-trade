
export interface BlockchainTransaction {
  txHash: string;
  asset: string;
  network: string;
  amount: number;
  confirmations: number;
  confirmed: boolean;
  toAddress: string;
}

export interface BlockchainGateway {
  verifyDeposit(
    txHash: string,
    asset: string,
    network: string,
    expectedAddress: string
  ): Promise<BlockchainTransaction | null>;

  createWithdrawal?(
    asset: string,
    network: string,
    address: string,
    amount: number
  ): Promise<{ txHash: string }>;
}

function required(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name}_NOT_CONFIGURED`);
  }

  return value;
}

export class ConfiguredBlockchainGateway
  implements BlockchainGateway {

  async verifyDeposit(
    txHash: string,
    asset: string,
    network: string,
    expectedAddress: string
  ) {
    const endpoint = required("BLOCKCHAIN_GATEWAY_URL");
    const apiKey = required("BLOCKCHAIN_GATEWAY_API_KEY");

    const response = await fetch(
      `${endpoint}/deposit/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          txHash,
          asset,
          network,
          expectedAddress
        }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error("BLOCKCHAIN_VERIFICATION_FAILED");
    }

    return response.json();
  }

  async createWithdrawal(
    asset: string,
    network: string,
    address: string,
    amount: number
  ) {
    const endpoint = required("BLOCKCHAIN_GATEWAY_URL");
    const apiKey = required("BLOCKCHAIN_GATEWAY_API_KEY");

    const response = await fetch(
      `${endpoint}/withdrawal/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          asset,
          network,
          address,
          amount
        }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error("BLOCKCHAIN_WITHDRAWAL_FAILED");
    }

    return response.json();
  }
}