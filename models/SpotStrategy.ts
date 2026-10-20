import mongoose, { Schema, Model } from "mongoose";

export type SpotStrategyExecutionMode = "manual" | "bot";
export type SpotStrategyStatus = "paused" | "running" | "completed" | "error";
export type SpotStrategyPhase =
  | "waiting_to_buy"
  | "buy_signal"
  | "buy_pending"
  | "holding"
  | "sell_signal"
  | "sell_pending";

export interface ISpotStrategyEvent {
  kind: "info" | "signal" | "order" | "error";
  message: string;
  price?: number;
  orderId?: string;
  createdAt: Date;
}

export interface ISpotStrategy {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  executionMode: SpotStrategyExecutionMode;
  entryOperator: "at_or_below" | "at_or_above";
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice?: number;
  quoteBudget: number;
  maxCycles: number;
  cyclesCompleted: number;
  positionQuantity: number;
  averageEntryPrice?: number;
  status: SpotStrategyStatus;
  phase: SpotStrategyPhase;
  pendingOrderId?: mongoose.Types.ObjectId | null;
  pendingSide?: "buy" | "sell" | null;
  runLockUntil?: Date | null;
  lastCheckedAt?: Date | null;
  lastPrice?: number;
  lastSignal?: string;
  lastError?: string;
  startedAt?: Date | null;
  stoppedAt?: Date | null;
  events: ISpotStrategyEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<ISpotStrategyEvent>(
  {
    kind: { type: String, enum: ["info", "signal", "order", "error"], required: true },
    message: { type: String, required: true, maxlength: 300 },
    price: { type: Number, min: 0 },
    orderId: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const SpotStrategySchema = new Schema<ISpotStrategy>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
    baseAsset: { type: String, required: true, uppercase: true },
    quoteAsset: { type: String, required: true, uppercase: true },
    executionMode: { type: String, enum: ["manual", "bot"], default: "manual", required: true },
    entryOperator: { type: String, enum: ["at_or_below", "at_or_above"], default: "at_or_below", required: true },
    entryPrice: { type: Number, required: true, min: 0 },
    takeProfitPrice: { type: Number, required: true, min: 0 },
    stopLossPrice: { type: Number, min: 0 },
    quoteBudget: { type: Number, required: true, min: 0 },
    maxCycles: { type: Number, required: true, min: 1, max: 100, default: 1 },
    cyclesCompleted: { type: Number, min: 0, default: 0 },
    positionQuantity: { type: Number, min: 0, default: 0 },
    averageEntryPrice: { type: Number, min: 0 },
    status: { type: String, enum: ["paused", "running", "completed", "error"], default: "paused", index: true },
    phase: {
      type: String,
      enum: ["waiting_to_buy", "buy_signal", "buy_pending", "holding", "sell_signal", "sell_pending"],
      default: "waiting_to_buy",
      required: true,
      index: true,
    },
    pendingOrderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    pendingSide: { type: String, enum: ["buy", "sell", null], default: null },
    runLockUntil: { type: Date, default: null, index: true },
    lastCheckedAt: { type: Date, default: null },
    lastPrice: { type: Number, min: 0 },
    lastSignal: { type: String, default: "" },
    lastError: { type: String, maxlength: 300, default: "" },
    startedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    events: { type: [EventSchema], default: [] },
  },
  { timestamps: true },
);

SpotStrategySchema.index({ userId: 1, createdAt: -1 });
SpotStrategySchema.index({ status: 1, phase: 1, runLockUntil: 1 });

const SpotStrategy: Model<ISpotStrategy> =
  mongoose.models.SpotStrategy ||
  mongoose.model<ISpotStrategy>("SpotStrategy", SpotStrategySchema);

export default SpotStrategy;
