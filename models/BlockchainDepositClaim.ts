import mongoose, { Model, Schema } from "mongoose";

export interface IBlockchainDepositClaim {
  txHash: string;
  depositRequestId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  asset: string;
  network: string;
  amount: number;
  createdAt?: Date;
}

const BlockchainDepositClaimSchema = new Schema<IBlockchainDepositClaim>(
  {
    txHash: { type: String, required: true, trim: true, lowercase: true },
    depositRequestId: { type: Schema.Types.ObjectId, ref: "DepositRequest", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    asset: { type: String, required: true, uppercase: true },
    network: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

BlockchainDepositClaimSchema.index({ txHash: 1 }, { unique: true });

const BlockchainDepositClaim =
  (mongoose.models.BlockchainDepositClaim as Model<IBlockchainDepositClaim>) ||
  mongoose.model<IBlockchainDepositClaim>("BlockchainDepositClaim", BlockchainDepositClaimSchema);

export default BlockchainDepositClaim;
