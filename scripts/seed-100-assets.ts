import { connectDB } from "../lib/mongodb";
import Asset from "../models/Asset";

const assets = [
  ['Bitcoin', 'BTC'],
  ['Ethereum', 'ETH'],
  ['Tether', 'USDT'],
  ['BNB', 'BNB'],
  ['Solana', 'SOL'],
  ['XRP', 'XRP'],
  ['USD Coin', 'USDC'],
  ['Dogecoin', 'DOGE'],
  ['Cardano', 'ADA'],
  ['Avalanche', 'AVAX'],
  ['TRON', 'TRX'],
  ['Chainlink', 'LINK'],
  ['Toncoin', 'TON'],
  ['Shiba Inu', 'SHIB'],
  ['Polkadot', 'DOT'],
  ['Wrapped stETH', 'WSTETH'],
  ['Uniswap', 'UNI'],
  ['Litecoin', 'LTC'],
  ['Bitcoin Cash', 'BCH'],
  ['NEAR Protocol', 'NEAR'],
  ['Internet Computer', 'ICP'],
  ['Stellar', 'XLM'],
  ['Dai', 'DAI'],
  ['Aptos', 'APT'],
  ['Filecoin', 'FIL'],
  ['Hedera', 'HBAR'],
  ['Cosmos', 'ATOM'],
  ['Cronos', 'CRO'],
  ['VeChain', 'VET'],
  ['Arbitrum', 'ARB'],
  ['Immutable', 'IMX'],
  ['Optimism', 'OP'],
  ['Injective', 'INJ'],
  ['Aave', 'AAVE'],
  ['The Graph', 'GRT'],
  ['Bittensor', 'TAO'],
  ['Theta Network', 'THETA'],
  ['Sui', 'SUI'],
  ['Maker', 'MKR'],
  ['Lido DAO', 'LDO'],
  ['Algorand', 'ALGO'],
  ['Flow', 'FLOW'],
  ['The Sandbox', 'SAND'],
  ['Decentraland', 'MANA'],
  ['Tezos', 'XTZ'],
  ['EOS', 'EOS'],
  ['PancakeSwap', 'CAKE'],
  ['Axie Infinity', 'AXS'],
  ['The Open Network', 'NOT'],
  ['Pyth Network', 'PYTH'],
  ['Jupiter', 'JUP'],
  ['Render', 'RENDER'],
  ['THORChain', 'RUNE'],
  ['Quant', 'QNT'],
  ['Kava', 'KAVA'],
  ['MultiversX', 'EGLD'],
  ['Fantom', 'FTM'],
  ['ApeCoin', 'APE'],
  ['Gala', 'GALA'],
  ['Chiliz', 'CHZ'],
  ['KuCoin Token', 'KCS'],
  ['Curve DAO Token', 'CRV'],
  ['Convex Finance', 'CVX'],
  ['Synthetix', 'SNX'],
  ['Compound', 'COMP'],
  ['Mina Protocol', 'MINA'],
  ['Arweave', 'AR'],
  ['Zcash', 'ZEC'],
  ['Monero', 'XMR'],
  ['Dash', 'DASH'],
  ['Neo', 'NEO'],
  ['IOTA', 'IOTA'],
  ['Kusama', 'KSM'],
  ['Basic Attention Token', 'BAT'],
  ['Enjin Coin', 'ENJ'],
  ['1inch', '1INCH'],
  ['Loopring', 'LRC'],
  ['Qtum', 'QTUM'],
  ['Zilliqa', 'ZIL'],
  ['Kadena', 'KDA'],
  ['Helium', 'HNT'],
  ['Osmosis', 'OSMO'],
  ['Celestia', 'TIA'],
  ['Sei', 'SEI'],
  ['Astar', 'ASTR'],
  ['dYdX', 'DYDX'],
  ['Blur', 'BLUR'],
  ['Frax Share', 'FXS'],
  ['Pendle', 'PENDLE'],
  ['Jito', 'JTO'],
  ['Bonk', 'BONK'],
  ['Wormhole', 'W'],
  ['JasmyCoin', 'JASMY'],
  ['Ondo', 'ONDO'],
  ['Ethena', 'ENA'],
  ['Starknet', 'STRK'],
  ['Worldcoin', 'WLD'],
  ['Mantle', 'MNT'],
  ['Kaspa', 'KAS'],
  ['Floki', 'FLOKI'],
  ['Pepe', 'PEPE'],
  ['Orca', 'ORCA'],
  ['Raydium', 'RAY'],
  ['Stacks', 'STX']
];

async function main() {
  await connectDB();

  let created = 0;
  let existing = 0;

  for (let i = 0; i < assets.length; i++) {
    const [name, symbol] = assets[i];

    const found = await Asset.findOne({ symbol });

    if (found) {
      existing++;
      continue;
    }

    await Asset.create({
      name,
      symbol,
      type: "crypto",
      enabled: true,
      depositEnabled: true,
      tradingEnabled: true,
      sortOrder: i + 1,
      networks: [],
    });

    created++;
  }

  console.log("ASSET SEED COMPLETE");
  console.log("TOTAL LIST:", assets.length);
  console.log("CREATED:", created);
  console.log("ALREADY EXISTED:", existing);
}

main().catch((error) => {
  console.error("SEED ERROR:", error);
  process.exit(1);
});