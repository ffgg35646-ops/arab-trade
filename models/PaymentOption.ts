import mongoose, { Schema, Model, Document } from "mongoose";

export interface IPaymentOption extends Document {
  name: string;
  asset: string;
  network: string;
  kind: "both" | "deposit" | "withdrawal";
  address: string;

  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalFee: number;
  warning: string;

  enabled: boolean;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const PaymentOptionSchema = new Schema<IPaymentOption>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    asset: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    network: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    kind: {
      type: String,
      enum: ["both", "deposit", "withdrawal"],
      default: "both",
      index: true,
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    minDeposit: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    maxDeposit: { type: Number, min: 0, default: 0 },
    minWithdrawal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    maxWithdrawal: { type: Number, min: 0, default: 0 },
    withdrawalFee: { type: Number, min: 0, default: 0 },
    warning: { type: String, trim: true, maxlength: 1000, default: "" },

    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    depositEnabled: { type: Boolean, default: true },
    withdrawalEnabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

PaymentOptionSchema.index(
  { asset: 1, network: 1 },
  { unique: true }
);

const PaymentOption: Model<IPaymentOption> =
  mongoose.models.PaymentOption ||
  mongoose.model<IPaymentOption>("PaymentOption", PaymentOptionSchema);

export default PaymentOption;