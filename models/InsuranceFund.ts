import mongoose, { Schema, Model } from "mongoose";

export interface IInsuranceFund {
  asset: string;
  balance: number;
  totalFunded: number;
  totalUsed: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const InsuranceFundSchema = new Schema<IInsuranceFund>(
  {
    asset: {
      type: String,
      required: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalFunded: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalUsed: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true, versionKey: false }
);

const InsuranceFund: Model<IInsuranceFund> =
  mongoose.models.InsuranceFund ||
  mongoose.model<IInsuranceFund>("InsuranceFund", InsuranceFundSchema);

export default InsuranceFund;
