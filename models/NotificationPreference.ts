import mongoose, { Schema, Document, Model } from "mongoose";

export interface INotificationPreference extends Document {
  userId: mongoose.Types.ObjectId;
  system: boolean;
  security: boolean;
  deposits: boolean;
  withdrawals: boolean;
  orders: boolean;
  trades: boolean;
  rewards: boolean;
  referral: boolean;
  email: boolean;
  push: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    system: { type: Boolean, default: true },
    security: { type: Boolean, default: true },
    deposits: { type: Boolean, default: true },
    withdrawals: { type: Boolean, default: true },
    orders: { type: Boolean, default: true },
    trades: { type: Boolean, default: true },
    rewards: { type: Boolean, default: true },
    referral: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default (mongoose.models.NotificationPreference as Model<INotificationPreference>) ||
  mongoose.model<INotificationPreference>("NotificationPreference", NotificationPreferenceSchema);