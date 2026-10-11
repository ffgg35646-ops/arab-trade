import mongoose, { Schema, Model, Document } from "mongoose";

export interface IVerificationRequest extends Document {
  userId: mongoose.Types.ObjectId;
  fullName: string;
  country: string;
  documentType: "passport" | "national_id" | "driver_license";
  documentNumber: string;
  status: "pending" | "approved" | "rejected";
  adminNote?: string;
  submittedAt: Date;
  reviewedAt?: Date | null;
}

const VerificationRequestSchema = new Schema<IVerificationRequest>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fullName: { type: String, required: true },
    country: { type: String, required: true },
    documentType: {
      type: String,
      enum: ["passport", "national_id", "driver_license"],
      required: true,
    },
    documentNumber: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    adminNote: { type: String, default: "" },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default (mongoose.models.VerificationRequest as Model<IVerificationRequest>) ||
  mongoose.model<IVerificationRequest>("VerificationRequest", VerificationRequestSchema);