import mongoose, { Schema, Model } from "mongoose";

export interface IDepositRequest {
  userId: mongoose.Types.ObjectId;
  asset: string;
  network: string;
  amount: number;
  txHash: string;
  confirmations?: number;
  confirmedAt?: Date;
  creditedAt?: Date;
  address: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string;
  screenshotPath?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DepositRequestSchema = new Schema<IDepositRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    asset: { type: String, required: true, uppercase: true },
    network: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    txHash: { type: String, default: "" },
  confirmations: { type: Number, default: 0, min: 0 },
  creditedAt: { type: Date, default: null },
  confirmedAt: { type: Date, default: null },
    address: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    adminNote: { type: String, default: "" },

    screenshotPath: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

DepositRequestSchema.index({ userId: 1, createdAt: -1 });

const DepositRequest: Model<IDepositRequest> =
  mongoose.models.DepositRequest ||
  mongoose.model<IDepositRequest>("DepositRequest", DepositRequestSchema);

export default DepositRequest;