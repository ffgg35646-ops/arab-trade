import mongoose, { Schema, Model, Document } from "mongoose";

export interface IMarginLoan extends Document {
  userId: mongoose.Types.ObjectId;
  positionId?: mongoose.Types.ObjectId | null;
  asset: string;
  amount: number;
  outstanding: number;
  interestRate: number;
  accruedInterest: number;
  badDebt: number;
  status: "active" | "repaid" | "liquidated";
  createdAt: Date;
  updatedAt: Date;
}

const MarginLoanSchema = new Schema<IMarginLoan>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    positionId: {
      type: Schema.Types.ObjectId,
      ref: "MarginPosition",
      default: null,
      index: true,
    },

    asset: {
      type: String,
      required: true,
      uppercase: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    outstanding: {
      type: Number,
      required: true,
      min: 0,
    },

    interestRate: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    accruedInterest: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    badDebt: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: ["active", "repaid", "liquidated"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

MarginLoanSchema.index({
  userId: 1,
  positionId: 1,
});

export default (mongoose.models.MarginLoan as Model<IMarginLoan>) ||
  mongoose.model<IMarginLoan>("MarginLoan", MarginLoanSchema);
