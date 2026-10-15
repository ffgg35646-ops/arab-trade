import mongoose, { Schema, Model } from "mongoose";

export interface IUser {
  arabTradeId?: number;
  name: string;
  username: string;
  email: string;
  password: string;
  role: "user" | "admin" | "admin_leader";
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId | null;
  isVerified: boolean;
  isActive: boolean;
  hasPendingWithdrawal?: boolean;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    arabTradeId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9_]+$/,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin", "admin_leader"],
      default: "user",
      index: true,
    },

    referralCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isVerified: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    hasPendingWithdrawal: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)


const User: Model<IUser> =
  mongoose.models.User ||
  mongoose.model<IUser>("User", UserSchema);

export default User;