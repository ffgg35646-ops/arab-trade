
import mongoose, { Schema } from "mongoose";

const FuturesOrderSchema = new Schema(
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
    type: { type: String, enum: ["limit", "market"], default: "limit" },
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    leverage: { type: Number, default: 1, min: 1, max: 125 },
    marginMode: { type: String, enum: ["isolated", "cross"], default: "isolated" },
    reduceOnly: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["open", "filled", "cancelled", "rejected"],
      default: "open",
      index: true
    }
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.models.FuturesOrder ||
  mongoose.model("FuturesOrder", FuturesOrderSchema);