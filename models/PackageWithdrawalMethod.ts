import mongoose, { Schema, Model, Document } from "mongoose";

export interface IPackageWithdrawalMethod extends Document {
  name: string;
  asset: string;
  network: string;
  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalFee: number;
  warning: string;
  enabled: boolean;
  withdrawalEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PackageWithdrawalMethodSchema = new Schema<IPackageWithdrawalMethod>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    asset: { type: String, required: true, trim: true, uppercase: true, default: "USDT", index: true },
    network: { type: String, required: true, trim: true, index: true },
    minWithdrawal: { type: Number, required: true, min: 0, default: 0 },
    maxWithdrawal: { type: Number, min: 0, default: 0 },
    withdrawalFee: { type: Number, min: 0, default: 0 },
    warning: { type: String, trim: true, maxlength: 1000, default: "" },
    enabled: { type: Boolean, default: true, index: true },
    withdrawalEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PackageWithdrawalMethodSchema.index({ asset: 1, network: 1 }, { unique: true });

const PackageWithdrawalMethod: Model<IPackageWithdrawalMethod> =
  mongoose.models.PackageWithdrawalMethod ||
  mongoose.model<IPackageWithdrawalMethod>("PackageWithdrawalMethod", PackageWithdrawalMethodSchema);

export default PackageWithdrawalMethod;
