import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUserSession extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  ip?: string;
  userAgent?: string;
  lastSeenAt: Date;
  expiresAt: Date;
  revoked: boolean;
  createdAt: Date;
}

const UserSessionSchema = new Schema<IUserSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revoked: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default (mongoose.models.UserSession as Model<IUserSession>) ||
  mongoose.model<IUserSession>("UserSession", UserSessionSchema);