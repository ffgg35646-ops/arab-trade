import mongoose, { Schema, Model } from "mongoose";

export interface INotification {
  userId: mongoose.Types.ObjectId;
  type: "system" | "account" | "security" | "deposit" | "withdrawal" | "trade" | "reward";
  title: string;
  message: string;
  read: boolean;
  createdAt?: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["system", "account", "security", "deposit", "withdrawal", "trade", "reward"],
      default: "system",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;