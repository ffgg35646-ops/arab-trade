import mongoose, { Schema, Model } from "mongoose";

export interface IAssetNetwork {
  name: string;
  code: string;
  enabled: boolean;
  depositEnabled: boolean;
  depositAddress: string;
  memoTag: string;
  confirmations: number;
  minDeposit: number;
  maxDeposit: number;
  warning: string;
  sortOrder: number;
}

export interface IAsset {
  name: string;
  symbol: string;
  type: "crypto";
  enabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  tradingEnabled: boolean;
  sortOrder: number;
  networks: IAssetNetwork[];
}

const NetworkSchema = new Schema<IAssetNetwork>({
  name: { type: String, required: true },
  code: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  depositEnabled: { type: Boolean, default: true },
  depositAddress: { type: String, default: "" },
  memoTag: { type: String, default: "" },
  confirmations: { type: Number, default: 12 },
  minDeposit: { type: Number, default: 10 },
  maxDeposit: { type: Number, default: 100000 },
  warning: { type: String, default: "" },
  sortOrder: { type: Number, default: 0 },
});

const AssetSchema = new Schema<IAsset>(
  {
    name: { type: String, required: true },
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["crypto"], default: "crypto" },
    enabled: { type: Boolean, default: true },
    depositEnabled: { type: Boolean, default: true },
    withdrawalEnabled: { type: Boolean, default: true },
    tradingEnabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    networks: { type: [NetworkSchema], default: [] },
  },
  { timestamps: true }
);

const Asset: Model<IAsset> =
  mongoose.models.Asset ||
  mongoose.model<IAsset>("Asset", AssetSchema);

export default Asset;