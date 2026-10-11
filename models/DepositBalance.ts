import mongoose, { Model, Schema } from "mongoose";

export interface IDepositBalance {
  userId: mongoose.Types.ObjectId;
  asset: string;
  available: number;
  locked: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const DepositBalanceSchema = new Schema<IDepositBalance>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    asset: { type: String, required: true, uppercase: true, trim: true },
    available: { type: Number, default: 0, min: 0 },
    locked: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);
DepositBalanceSchema.index({ userId: 1, asset: 1 }, { unique: true });

const DepositBalance =
  (mongoose.models.DepositBalance as Model<IDepositBalance>) ||
  mongoose.model<IDepositBalance>("DepositBalance", DepositBalanceSchema);

export default DepositBalance;
