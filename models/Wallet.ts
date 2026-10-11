import mongoose, { Schema, Model } from "mongoose";

export interface IWalletBalance {
  asset: string;
  available: number;
  locked: number;
}

export interface IWallet {
  mode: "demo" | "live";
  userId: mongoose.Types.ObjectId;
  type: "spot" | "funding";
  balances: IWalletBalance[];
  createdAt?: Date;
  updatedAt?: Date;
}

const BalanceSchema = new Schema<IWalletBalance>(
  {
    asset: { type: String, required: true, uppercase: true },
    available: { type: Number, default: 0, min: 0 },
    locked: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const WalletSchema = new Schema<IWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["spot", "funding"],
      required: true,
      index: true,
    },

    mode: {
      type: String,
      enum: ["demo", "live"],
      default: "live",
      index: true,
    },
    balances: {
      type: [BalanceSchema],
      default: [],
    },
  },
  { timestamps: true }
);

WalletSchema.index({ userId: 1, type: 1, mode: 1 }, { unique: true });

const Wallet: Model<IWallet> =
  mongoose.models.Wallet || mongoose.model<IWallet>("Wallet", WalletSchema);

export default Wallet;