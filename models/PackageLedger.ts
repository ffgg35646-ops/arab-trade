import mongoose, { Model, Schema } from "mongoose";

export interface IPackageLedger {
  userId: mongoose.Types.ObjectId;
  userPackageId: mongoose.Types.ObjectId;
  type: "activation" | "realized_earning" | "cancellation_refund" | "withdrawal" | "withdrawal_reversal";
  asset: string;
  amount: number;
  note: string;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt?: Date;
}

const PackageLedgerSchema = new Schema<IPackageLedger>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userPackageId: { type: Schema.Types.ObjectId, ref: "UserPackage", required: true, index: true },
    type: {
      type: String,
      enum: ["activation", "realized_earning", "cancellation_refund", "withdrawal", "withdrawal_reversal"],
      required: true,
      index: true,
    },
    asset: { type: String, required: true, uppercase: true, default: "USDT" },
    amount: { type: Number, required: true },
    note: { type: String, default: "", maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
PackageLedgerSchema.index({ userPackageId: 1, createdAt: -1 });

const PackageLedger =
  (mongoose.models.PackageLedger as Model<IPackageLedger>) ||
  mongoose.model<IPackageLedger>("PackageLedger", PackageLedgerSchema);

export default PackageLedger;
