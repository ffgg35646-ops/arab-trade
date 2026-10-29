import mongoose, { Schema, Model } from "mongoose";

export interface IQuickTrade {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  side: "buy" | "sell";
  stakeAmount: number;
  entryPrice: number;
  status: "open" | "closed";
  openedAt: Date;
  expiresAt: Date;
  closedAt?: Date;
  outcome?: "loss";
  mode: "demo";
  createdAt?: Date;
  updatedAt?: Date;
}

const QuickTradeSchema = new Schema<IQuickTrade>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  symbol: { type: String, required: true, uppercase: true, index: true },
  side: { type: String, enum: ["buy", "sell"], required: true },
  stakeAmount: { type: Number, required: true, min: 0.01 },
  entryPrice: { type: Number, required: true, min: 0.00000001 },
  status: { type: String, enum: ["open", "closed"], default: "open", index: true },
  openedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true, index: true },
  closedAt: { type: Date },
  outcome: { type: String, enum: ["loss"] },
  mode: { type: String, enum: ["demo"], default: "demo", index: true },
}, { timestamps: true });

QuickTradeSchema.index({ userId: 1, createdAt: -1 });
QuickTradeSchema.index({ status: 1, expiresAt: 1 });

export default (mongoose.models.QuickTrade as Model<IQuickTrade>) ||
  mongoose.model<IQuickTrade>("QuickTrade", QuickTradeSchema);
