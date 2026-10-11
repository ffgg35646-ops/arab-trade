import mongoose, { Schema, Model } from "mongoose";

export interface IWithdrawalRequest {
  userId: mongoose.Types.ObjectId;
  asset: string;
  network: string;
  amount: number;
  fee: number;
  receiveAmount: number;
  address: string;
  status: "pending" | "approved" | "processing" | "rejected" | "failed" | "completed";
  adminNote: string;
  txHash?: string;
  broadcastedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    asset: { type: String, required: true, uppercase: true },
    network: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    fee: { type: Number, required: true, min: 0 },
    receiveAmount: { type: Number, required: true, min: 0 },
    address: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
      index: true,
    },
    adminNote: { type: String, default: "" },
    txHash: { type: String, default: "", index: true },
    broadcastedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

WithdrawalRequestSchema.index({ userId: 1, createdAt: -1 });
WithdrawalRequestSchema.index({ txHash: 1 });

const WithdrawalRequest: Model<IWithdrawalRequest> =
  mongoose.models.WithdrawalRequest ||
  mongoose.model<IWithdrawalRequest>("WithdrawalRequest", WithdrawalRequestSchema);

export default WithdrawalRequest;