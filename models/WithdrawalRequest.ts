import mongoose, { Model, Schema } from "mongoose";
export interface IWithdrawalRequest {
 userId: mongoose.Types.ObjectId; userPackageId: mongoose.Types.ObjectId; packageId: mongoose.Types.ObjectId;
 amount: number; asset: "USDT"; network: "TRC20" | "BEP20"; payoutAddress: string; status: "pending" | "approved" | "rejected"; reviewedAt?: Date | null;
 createdAt?: Date;
}
const schema = new Schema<IWithdrawalRequest>({
 userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
 userPackageId: { type: Schema.Types.ObjectId, ref: "UserPackage", required: true },
 packageId: { type: Schema.Types.ObjectId, ref: "InvestmentPackage", required: true },
 amount: { type: Number, required: true, min: 0.00000001 },
 asset: { type: String, enum: ["USDT"], required: true, default: "USDT" },
 network: { type: String, enum: ["TRC20", "BEP20"], required: true },
 payoutAddress: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
 status: { type: String, enum: ["pending","approved","rejected"], default: "pending", required: true },
 reviewedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
schema.index({ userPackageId: 1, status: 1 });
export default (mongoose.models.WithdrawalRequest as Model<IWithdrawalRequest>) || mongoose.model<IWithdrawalRequest>("WithdrawalRequest",schema);
