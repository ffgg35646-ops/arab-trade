import mongoose, { Model, Schema } from "mongoose";

export interface IWithdrawalAllocation {
  userPackageId: mongoose.Types.ObjectId;
  amount: number;
}

export interface IWithdrawalRequest {
  userId: mongoose.Types.ObjectId;
  type: "general" | "package";
  userPackageId?: mongoose.Types.ObjectId;
  packageId?: mongoose.Types.ObjectId;
  allocations?: IWithdrawalAllocation[];
  amount: number;
  asset: "USDT";
  network: string;
  payoutAddress: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt?: Date | null;
  createdAt?: Date;
}

const AllocationSchema = new Schema<IWithdrawalAllocation>({
  userPackageId: { type: Schema.Types.ObjectId, ref: "UserPackage", required: true },
  amount: { type: Number, required: true, min: 0.00000001 },
}, { _id: false });

const schema = new Schema<IWithdrawalRequest>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["general", "package"], default: "package", required: true, index: true },
  userPackageId: { type: Schema.Types.ObjectId, ref: "UserPackage", required: false },
  packageId: { type: Schema.Types.ObjectId, ref: "InvestmentPackage", required: false, index: true },
  allocations: { type: [AllocationSchema], default: [] },
  amount: { type: Number, required: true, min: 0.00000001 },
  asset: { type: String, enum: ["USDT"], required: true, default: "USDT" },
  network: { type: String, required: true, trim: true },
  payoutAddress: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", required: true },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
schema.index({ packageId: 1, status: 1 });
export default (mongoose.models.WithdrawalRequest as Model<IWithdrawalRequest>) || mongoose.model<IWithdrawalRequest>("WithdrawalRequest", schema);
