import mongoose, { Model, Schema } from "mongoose";

export interface IInvestmentPackage {
  name: string;
  description: string;
  price: number;
  asset: string;
  durationDays: number;
  dailyProfit: number;
  minimumWithdrawal: number;
  enabled: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const InvestmentPackageSchema = new Schema<IInvestmentPackage>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 1200 },
    price: { type: Number, required: true, min: 1 },
    asset: { type: String, default: "USDT", uppercase: true, trim: true },
    durationDays: { type: Number, required: true, default: 0, min: 0, max: 36500 },
    dailyProfit: { type: Number, default: 0, min: 0, max: 1000000000 },
    minimumWithdrawal: { type: Number, default: 50, min: 0 },
    enabled: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);
InvestmentPackageSchema.index({ enabled: 1, sortOrder: 1 });

const InvestmentPackage =
  (mongoose.models.InvestmentPackage as Model<IInvestmentPackage>) ||
  mongoose.model<IInvestmentPackage>("InvestmentPackage", InvestmentPackageSchema);

export default InvestmentPackage;
