import mongoose, { Document, Model, Schema } from "mongoose";

export interface IWithdrawalAddress extends Document {
  userId: mongoose.Types.ObjectId;
  asset: string;
  network: string;
  address: string;
  packageAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalAddressSchema = new Schema<IWithdrawalAddress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    asset: { type: String, required: true, trim: true, uppercase: true, index: true },
    network: { type: String, required: true, trim: true, index: true },
    // Legacy "address" remains the general-wallet withdrawal address.
    address: { type: String, default: "", trim: true, maxlength: 500 },
    packageAddress: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

WithdrawalAddressSchema.index({ userId: 1, asset: 1, network: 1 }, { unique: true });

const WithdrawalAddress: Model<IWithdrawalAddress> =
  mongoose.models.WithdrawalAddress ||
  mongoose.model<IWithdrawalAddress>("WithdrawalAddress", WithdrawalAddressSchema);

export default WithdrawalAddress;
