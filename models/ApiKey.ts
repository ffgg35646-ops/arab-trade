import mongoose, { Schema, Model } from "mongoose";

export interface IApiKey {
  userId: mongoose.Types.ObjectId;
  name: string;
  key: string;
  secretHash: string;
  permissions: string[];
  active: boolean;
  lastUsedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, unique: true, index: true },
    secretHash: { type: String, required: true, select: false },
    permissions: { type: [String], default: ["read"] },
    active: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const ApiKey: Model<IApiKey> =
  mongoose.models.ApiKey ||
  mongoose.model<IApiKey>("ApiKey", ApiKeySchema);

export default ApiKey;