import mongoose, { Schema, Model, Document } from "mongoose";

export interface IPaymentMethod extends Document {
  userId: mongoose.Types.ObjectId;
  type: "bank" | "wallet" | "other";
  label: string;
  provider: string;
  identifier: string;
  isDefault: boolean;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentMethodSchema = new Schema<IPaymentMethod>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["bank", "wallet", "other"],
      required: true,
    },
    label: { type: String, required: true },
    provider: { type: String, default: "" },
    identifier: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default (mongoose.models.PaymentMethod as Model<IPaymentMethod>) ||
  mongoose.model<IPaymentMethod>("PaymentMethod", PaymentMethodSchema);