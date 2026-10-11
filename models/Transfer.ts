import mongoose, { Schema, Model } from "mongoose";

export interface ITransfer {
  userId: mongoose.Types.ObjectId;
  asset: string;
  amount: number;
  from: "spot" | "funding";
  to: "spot" | "funding";
  status: "completed" | "failed";
  createdAt?: Date;
}

const TransferSchema = new Schema<ITransfer>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    asset: { type: String, required: true, uppercase: true },
    amount: { type: Number, required: true, min: 0 },
    from: { type: String, enum: ["spot", "funding"], required: true },
    to: { type: String, enum: ["spot", "funding"], required: true },
    status: { type: String, enum: ["completed", "failed"], default: "completed" },
  },
  { timestamps: true }
);

TransferSchema.index({ userId: 1, createdAt: -1 });

const Transfer: Model<ITransfer> =
  mongoose.models.Transfer ||
  mongoose.model<ITransfer>("Transfer", TransferSchema);

export default Transfer;