import mongoose, { Model, Schema } from "mongoose";

export interface IUserPackage {
  userId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  packageName: string;
  investedAmount: number;
  asset: string;
  durationDays: number;
  status: "active" | "cancelled";
  availableEarnings: number;
  lockedEarnings: number;
  totalRealizedEarnings: number;
  totalWithdrawn: number;
  withdrawablePrincipalCredited?: boolean;
  withdrawalBalanceDebt?: number;
  withdrawalBalanceReconciled?: boolean;
  firstWithdrawalStatus: "available" | "pending" | "approved" | "completed";
  withdrawalRequestPending: boolean;
  cancellationRefund: number;
  cancellationRefundPackageCredited?: boolean;
  activatedAt: Date;
  lastProfitAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserPackageSchema = new Schema<IUserPackage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    packageId: { type: Schema.Types.ObjectId, ref: "InvestmentPackage", required: true, index: true },
    packageName: { type: String, required: true, trim: true },
    investedAmount: { type: Number, required: true, min: 0 },
    asset: { type: String, required: true, uppercase: true, default: "USDT" },
    durationDays: { type: Number, required: true, default: 0, min: 0, max: 36500 },
    status: { type: String, enum: ["active", "cancelled"], default: "active", index: true },
    availableEarnings: { type: Number, default: 0, min: 0 },
    lockedEarnings: { type: Number, default: 0, min: 0 },
    totalRealizedEarnings: { type: Number, default: 0, min: 0 },
    totalWithdrawn: { type: Number, default: 0, min: 0 },
    withdrawablePrincipalCredited: { type: Boolean, default: false },
    withdrawalBalanceDebt: { type: Number, default: 0, min: 0 },
    withdrawalBalanceReconciled: { type: Boolean, default: false, index: true },
    firstWithdrawalStatus: { type: String, enum: ["available", "pending", "approved", "completed"], default: "available", index: true },
    withdrawalRequestPending: { type: Boolean, default: false, index: true },
    cancellationRefund: { type: Number, default: 0, min: 0 },
    cancellationRefundPackageCredited: { type: Boolean, default: false, index: true },
    activatedAt: { type: Date, default: Date.now },
    lastProfitAt: { type: Date, default: Date.now },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);
UserPackageSchema.index({ userId: 1, status: 1, createdAt: -1 });

const UserPackage =
  (mongoose.models.UserPackage as Model<IUserPackage>) ||
  mongoose.model<IUserPackage>("UserPackage", UserPackageSchema);

export default UserPackage;
