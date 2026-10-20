import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITrade extends Document {
  mode: "demo" | "live";
  symbol: string;
  takerSide?: "buy" | "sell";
  side?: "buy" | "sell";
  executionProvider?: "internal" | "binance";
  userId?: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  externalTradeId?: string;
  buyOrderId?: mongoose.Types.ObjectId;
  sellOrderId?: mongoose.Types.ObjectId;
  buyerId?: mongoose.Types.ObjectId;
  sellerId?: mongoose.Types.ObjectId;
  price: number;
  quantity: number;
  quoteAmount: number;
  feeBuyer: number;
  feeSeller: number;
  buyerFeeAsset: string;
  sellerFeeAsset: string;
  createdAt: Date;
}

const TradeSchema = new Schema<ITrade>(
  {
    mode: {
      type: String,
      enum: ["demo", "live"],
      default: "live",
      index: true,
    },

    symbol: { type: String, required: true, index: true },
    takerSide: { type: String, enum: ["buy", "sell"] },
    side: { type: String, enum: ["buy", "sell"] },
    executionProvider: { type: String, enum: ["internal", "binance"], default: "internal", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: false, index: true },
    externalTradeId: { type: String, required: false, index: true },
    buyOrderId: { type: Schema.Types.ObjectId, ref: "Order", required: false, index: true },
    sellOrderId: { type: Schema.Types.ObjectId, ref: "Order", required: false, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0 },
    quoteAmount: { type: Number, required: true, min: 0 },
    feeBuyer: { type: Number, required: true, min: 0, default: 0 },
    feeSeller: { type: Number, required: true, min: 0, default: 0 },
    buyerFeeAsset: { type: String, required: true },
    sellerFeeAsset: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default (mongoose.models.Trade as Model<ITrade>) ||
  mongoose.model<ITrade>("Trade", TradeSchema);