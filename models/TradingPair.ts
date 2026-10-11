import mongoose, { Schema, Model, Document } from "mongoose";

export interface ITradingPair extends Document {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;

  status: "TRADING" | "HALT";
  spotTradingEnabled: boolean;

  minPrice: number;
  maxPrice: number;
  tickSize: number;

  minQuantity: number;
  maxQuantity: number;
  stepSize: number;

  minNotional: number;

  pricePrecision: number;
  quantityPrecision: number;

  sortOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

const TradingPairSchema = new Schema<ITradingPair>(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    baseAsset: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    quoteAsset: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["TRADING", "HALT"],
      default: "HALT",
      index: true,
    },

    spotTradingEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },

    minPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    tickSize: {
      type: Number,
      default: 0.00000001,
      min: 0,
    },

    minQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    stepSize: {
      type: Number,
      default: 0.00000001,
      min: 0,
    },

    minNotional: {
      type: Number,
      default: 0,
      min: 0,
    },

    pricePrecision: {
      type: Number,
      default: 8,
      min: 0,
      max: 18,
    },

    quantityPrecision: {
      type: Number,
      default: 8,
      min: 0,
      max: 18,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

TradingPairSchema.index({
  baseAsset: 1,
  quoteAsset: 1,
});

const TradingPair: Model<ITradingPair> =
  mongoose.models.TradingPair ||
  mongoose.model<ITradingPair>("TradingPair", TradingPairSchema);

export default TradingPair;