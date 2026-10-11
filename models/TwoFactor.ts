import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITwoFactor extends Document {
  userId: mongoose.Types.ObjectId;
  secret: string;
  enabled: boolean;
  backupCodes: string[];
  verifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TwoFactorSchema = new Schema<ITwoFactor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    secret: { type: String, required: true },
    enabled: { type: Boolean, default: false },
    backupCodes: { type: [String], default: [] },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default (mongoose.models.TwoFactor as Model<ITwoFactor>) ||
  mongoose.model<ITwoFactor>("TwoFactor", TwoFactorSchema);