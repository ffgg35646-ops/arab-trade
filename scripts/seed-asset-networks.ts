import { connectDB } from "../lib/mongodb";
import Asset from "../models/Asset";

type NetworkSeed = {
  name: string;
  code: string;
  depositEnabled?: boolean;
  withdrawalEnabled?: boolean;
  depositAddress?: string;
  minDeposit?: number;
  maxDeposit?: number;
  minWithdrawal?: number;
  maxWithdrawal?: number;
  withdrawalFee?: number;
  confirmations?: number;
};

const networks: Record<string, NetworkSeed[]> = {
  BTC: [
    {
      name: "Bitcoin",
      code: "BITCOIN",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ETH: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  USDT: [
    {
      name: "TRON",
      code: "TRC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "BNB Smart Chain",
      code: "BEP20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  USDC: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "BNB Smart Chain",
      code: "BEP20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  BNB: [
    {
      name: "BNB Smart Chain",
      code: "BEP20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  SOL: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  TRX: [
    {
      name: "TRON",
      code: "TRC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  XRP: [
    {
      name: "XRP Ledger",
      code: "XRP",
      depositEnabled: false,
      withdrawalEnabled: false,
      memoTag: "",
    } as any,
  ],

  ADA: [
    {
      name: "Cardano",
      code: "CARDANO",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  DOGE: [
    {
      name: "Dogecoin",
      code: "DOGE",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  LTC: [
    {
      name: "Litecoin",
      code: "LTC",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  BCH: [
    {
      name: "Bitcoin Cash",
      code: "BCH",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  DOT: [
    {
      name: "Polkadot",
      code: "DOT",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  AVAX: [
    {
      name: "Avalanche C-Chain",
      code: "AVAXC",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  TON: [
    {
      name: "TON",
      code: "TON",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  XLM: [
    {
      name: "Stellar",
      code: "XLM",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ATOM: [
    {
      name: "Cosmos",
      code: "COSMOS",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  NEAR: [
    {
      name: "NEAR",
      code: "NEAR",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  FIL: [
    {
      name: "Filecoin",
      code: "FIL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ALGO: [
    {
      name: "Algorand",
      code: "ALGO",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  XTZ: [
    {
      name: "Tezos",
      code: "XTZ",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  EOS: [
    {
      name: "EOS",
      code: "EOS",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  APT: [
    {
      name: "Aptos",
      code: "APTOS",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  SUI: [
    {
      name: "Sui",
      code: "SUI",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ICP: [
    {
      name: "Internet Computer",
      code: "ICP",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  HBAR: [
    {
      name: "Hedera",
      code: "HBAR",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ARB: [
    {
      name: "Arbitrum One",
      code: "ARBITRUM",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  OP: [
    {
      name: "Optimism",
      code: "OPTIMISM",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  LINK: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  UNI: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  SHIB: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "BNB Smart Chain",
      code: "BEP20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  PEPE: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "BNB Smart Chain",
      code: "BEP20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  FLOKI: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "BNB Smart Chain",
      code: "BEP20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  AAVE: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  MKR: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  LDO: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  GRT: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  SAND: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "BNB Smart Chain",
      code: "BEP20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  MANA: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  MATIC: [
    {
      name: "Polygon",
      code: "POLYGON",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  CAKE: [
    {
      name: "BNB Smart Chain",
      code: "BEP20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  IMX: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  RENDER: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  RUNE: [
    {
      name: "THORChain",
      code: "THOR",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  CHZ: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  CRV: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  SNX: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  COMP: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  BAT: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ENJ: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  "1INCH": [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  LRC: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ZIL: [
    {
      name: "Zilliqa",
      code: "ZIL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  KSM: [
    {
      name: "Kusama",
      code: "KSM",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  HNT: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  TIA: [
    {
      name: "Celestia",
      code: "TIA",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  SEI: [
    {
      name: "Sei",
      code: "SEI",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ASTR: [
    {
      name: "Astar",
      code: "ASTAR",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  DYDX: [
    {
      name: "dYdX",
      code: "DYDX",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  BLUR: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  PENDLE: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  JTO: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  JUP: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  BONK: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  W: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  JASMY: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ONDO: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ENA: [
    {
      name: "Ethereum",
      code: "ERC20",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  STRK: [
    {
      name: "Starknet",
      code: "STARKNET",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  WLD: [
    {
      name: "World Chain",
      code: "WORLDCHAIN",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  MNT: [
    {
      name: "Mantle",
      code: "MANTLE",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  KAS: [
    {
      name: "Kaspa",
      code: "KASPA",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  STX: [
    {
      name: "Stacks",
      code: "STACKS",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  ORCA: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],

  RAY: [
    {
      name: "Solana",
      code: "SOL",
      depositEnabled: false,
      withdrawalEnabled: false,
    },
  ],
};

function normalizeNetwork(network: NetworkSeed) {
  return {
    name: network.name,
    code: network.code,
    enabled: true,
    depositEnabled: network.depositEnabled ?? false,
    withdrawalEnabled: network.withdrawalEnabled ?? false,
    depositAddress: network.depositAddress ?? "",
    memoTag: "",
    confirmations: network.confirmations ?? 12,
    minDeposit: network.minDeposit ?? 10,
    maxDeposit: network.maxDeposit ?? 100000,
    minWithdrawal: network.minWithdrawal ?? 50,
    maxWithdrawal: network.maxWithdrawal ?? 50000,
    withdrawalFee: network.withdrawalFee ?? 0,
    warning: "",
    sortOrder: 0,
  };
}

async function main() {
  await connectDB();

  let assetsFound = 0;
  let networksAdded = 0;

  for (const [symbol, seedNetworks] of Object.entries(networks)) {
    const asset = await Asset.findOne({ symbol });

    if (!asset) {
      continue;
    }

    assetsFound++;

    const current = Array.isArray(asset.networks)
      ? asset.networks.map((n: any) => ({
          name: n.name,
          code: n.code,
          enabled: n.enabled,
          depositEnabled: n.depositEnabled,
          withdrawalEnabled: n.withdrawalEnabled,
          depositAddress: n.depositAddress,
          memoTag: n.memoTag,
          confirmations: n.confirmations,
          minDeposit: n.minDeposit,
          maxDeposit: n.maxDeposit,
          minWithdrawal: n.minWithdrawal,
          maxWithdrawal: n.maxWithdrawal,
          withdrawalFee: n.withdrawalFee,
          warning: n.warning,
          sortOrder: n.sortOrder,
        }))
      : [];

    for (const seed of seedNetworks) {
      const exists = current.some(
        (network) => network.code === seed.code
      );

      if (!exists) {
        current.push(normalizeNetwork(seed));
        networksAdded++;
      }
    }

    asset.networks = current.map((network: any) => ({
      ...network,
      enabled: network.enabled ?? true,
    })) as any;

    await asset.save();
  }

  console.log("ASSET NETWORKS SEEDED");
  console.log("ASSETS FOUND:", assetsFound);
  console.log("NETWORKS ADDED:", networksAdded);
}

main().catch((error) => {
  console.error("SEED NETWORKS ERROR:", error);
  process.exit(1);
});