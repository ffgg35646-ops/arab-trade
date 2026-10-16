import mongoose, { Schema, Document, Model } from "mongoose";

export type LedgerType =
  | "deposit"
  | "transfer"
  | "trade"
  | "fee"
  | "reward"
  | "referral"
  | "adjustment"
  | "margin_open"
  | "margin_close"
  | "margin_interest"
  | "margin_liquidation"
  | "liquidation_fee"
  | "insurance_fund_credit"
  | "insurance_fund_debit"
  | "bad_debt";

export interface ILedgerEntry extends Document {
  userId?: mongoose.Types.ObjectId;
  scope: "user" | "system";
  systemAccount?: string;
  asset: string;
  mode: "demo" | "live";
  type: LedgerType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string;
  note?: string;
  createdAt: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true },
    scope: {
      type: String,
      enum: ["user", "system"],
      default: "user",
      required: true,
      index: true,
    },
    systemAccount: {
      type: String,
      default: "",
      index: true,
    },
    asset: { type: String, required: true, index: true },
    mode: {
      type: String,
      enum: ["demo", "live"],
      default: "live",
      required: true,
      index: true,
    },
    type: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    referenceId: { type: String, default: "", index: true },
    note: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default (mongoose.models.LedgerEntry as Model<ILedgerEntry>) ||
  mongoose.model<ILedgerEntry>("LedgerEntry", LedgerEntrySchema);