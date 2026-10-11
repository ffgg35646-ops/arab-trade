
import mongoose, { Schema } from "mongoose";

const FundingPaymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    positionId: { type: Schema.Types.ObjectId, required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, index: true },
    notional: { type: Number, required: true },
    fundingRate: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "settled", "failed"],
      default: "pending",
      index: true
    },
    createdAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

export default mongoose.models.FundingPayment ||
  mongoose.model("FundingPayment", FundingPaymentSchema);