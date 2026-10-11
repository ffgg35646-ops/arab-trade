import mongoose, { Schema, Document, Model } from "mongoose";

export interface IReward extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  type: "bonus" | "cashback" | "commission" | "mission";
  amount: number;
  asset: string;
  status: "pending" | "available" | "claimed" | "expired";
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const RewardSchema = new Schema<IReward>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    type: { type: String, enum: ["bonus", "cashback", "commission", "mission"], required: true },
    amount: { type: Number, required: true, min: 0 },
    asset: { type: String, required: true, uppercase: true },
    status: { type: String, enum: ["pending", "available", "claimed", "expired"], default: "available", index: true },
    expiresAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default (mongoose.models.Reward as Model<IReward>) ||
  mongoose.model<IReward>("Reward", RewardSchema);