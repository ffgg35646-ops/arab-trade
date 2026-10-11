import mongoose, { Schema } from "mongoose";

const FuturesPositionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    mode: {
      type: String,
      enum: ["demo", "live"],
      default: "live",
      index: true
    },
    symbol: { type: String, required: true, uppercase: true, index: true },
    side: { type: String, enum: ["long", "short"], required: true },
    quantity: { type: Number, required: true, min: 0 },
    entryPrice: { type: Number, required: true, min: 0 },
    markPrice: { type: Number, required: true, min: 0 },
    leverage: { type: Number, required: true, min: 1, max: 125 },
    marginMode: { type: String, enum: ["isolated", "cross"], default: "isolated" },
    margin: { type: Number, required: true, min: 0 },
    pnl: { type: Number, default: 0 },
    liquidationPrice: { type: Number, default: 0 },
    status: { type: String, enum: ["open", "closed", "liquidated"], default: "open", index: true }
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.FuturesPosition ||
  mongoose.model("FuturesPosition", FuturesPositionSchema);