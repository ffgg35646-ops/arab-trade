import mongoose, { Schema, Model, Document } from "mongoose";

export interface IUserPreference extends Document {
  userId: mongoose.Types.ObjectId;
  language: string;
  displayCurrency: string;
  theme: "dark" | "light" | "system";
  hideBalances: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  defaultOrderType: "limit" | "market";
  defaultTradingPair: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserPreferenceSchema = new Schema<IUserPreference>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    language: { type: String, default: "ar" },
    displayCurrency: { type: String, default: "USDT" },
    theme: {
      type: String,
      enum: ["dark", "light", "system"],
      default: "dark",
    },
    hideBalances: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    defaultOrderType: {
      type: String,
      enum: ["limit", "market"],
      default: "limit",
    },
    defaultTradingPair: { type: String, default: "BTCUSDT" },
  },
  { timestamps: true }
);

export default (mongoose.models.UserPreference as Model<IUserPreference>) ||
  mongoose.model<IUserPreference>("UserPreference", UserPreferenceSchema);