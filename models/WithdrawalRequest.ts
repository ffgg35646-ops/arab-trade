import mongoose, { Model, Schema } from "mongoose";

export interface IWithdrawalAllocation {
  userPackageId: mongoose.Types.ObjectId;
  packageId?: mongoose.Types.ObjectId;
  amount: number;
}

export interface IWithdrawalRequest {
  userId: mongoose.Types.ObjectId;
  type: "general" | "package";
  generalSource?: "wallet" | "deposit";
  userPackageId?: mongoose.Types.ObjectId;
  packageId?: mongoose.Types.ObjectId;
  allocations?: IWithdrawalAllocation[];
  /** Gross amount held from the user's withdrawal balance. */
  amount: number;
  grossAmount?: number;
  feePercent?: number;
  feeAmount?: number;
  payoutAmount?: number;
  conversionAsset?: string;
  conversionOrderId?: mongoose.Types.ObjectId;
  conversionQuantity?: number;
  conversionPrice?: number;
  tradingFeeAmount?: number;
  asset: "USDT";
  network: string;
  payoutAddress: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt?: Date | null;
  createdAt?: Date;
}

const AllocationSchema = new Schema<IWithdrawalAllocation>({
  userPackageId: { type: Schema.Types.ObjectId, ref: "UserPackage", required: true },
  packageId: { type: Schema.Types.ObjectId, ref: "InvestmentPackage", required: false },
  amount: { type: Number, required: true, min: 0.00000001 },
}, { _id: false });

const schema = new Schema<IWithdrawalRequest>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["general", "package"], default: "package", required: true, index: true },
  generalSource: { type: String, enum: ["wallet", "deposit"], default: "wallet" },
  userPackageId: { type: Schema.Types.ObjectId, ref: "UserPackage", required: false },
  packageId: { type: Schema.Types.ObjectId, ref: "InvestmentPackage", required: false, index: true },
  allocations: { type: [AllocationSchema], default: [] },
  amount: { type: Number, required: true, min: 0.00000001 },
  grossAmount: { type: Number, min: 0 },
  feePercent: { type: Number, min: 0, max: 100 },
  feeAmount: { type: Number, min: 0 },
  payoutAmount: { type: Number, min: 0 },
  conversionAsset: { type: String, uppercase: true, trim: true },
  conversionOrderId: { type: Schema.Types.ObjectId, ref: "Order", required: false },
  conversionQuantity: { type: Number, min: 0 },
  conversionPrice: { type: Number, min: 0 },
  tradingFeeAmount: { type: Number, min: 0 },
  asset: { type: String, enum: ["USDT"], required: true, default: "USDT" },
  network: { type: String, required: true, trim: true },
  payoutAddress: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", required: true },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
schema.index({ packageId: 1, status: 1 });
schema.index({ conversionOrderId: 1 }, { unique: true, sparse: true });
export default (mongoose.models.WithdrawalRequest as Model<IWithdrawalRequest>) || mongoose.model<IWithdrawalRequest>("WithdrawalRequest", schema);
