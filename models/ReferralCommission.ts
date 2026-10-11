import mongoose, { Schema, Document, Model } from "mongoose";

export interface IReferralCommission extends Document {
  referrerId: mongoose.Types.ObjectId;
  referredUserId: mongoose.Types.ObjectId;
  tradeId?: mongoose.Types.ObjectId | null;
  amount: number;
  asset: string;
  rate: number;
  status: "pending" | "available" | "paid";
  createdAt: Date;
  updatedAt: Date;
}

const ReferralCommissionSchema = new Schema<IReferralCommission>(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referredUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tradeId: { type: Schema.Types.ObjectId, ref: "Trade", default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    asset: { type: String, required: true, uppercase: true },
    rate: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "available", "paid"], default: "available", index: true },
  },
  { timestamps: true }
);

export default (mongoose.models.ReferralCommission as Model<IReferralCommission>) ||
  mongoose.model<IReferralCommission>("ReferralCommission", ReferralCommissionSchema);