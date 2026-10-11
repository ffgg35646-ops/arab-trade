import mongoose, { Schema, Document, Model } from "mongoose";

export type KycStatus = "pending" | "approved" | "rejected";
export type KycDocumentType = "passport" | "national_id";

export interface IKycRequest extends Document {
  userId: mongoose.Types.ObjectId;

  fullName: string;
  dateOfBirth: string;
  nationality: string;

  documentType: KycDocumentType;
  documentNumber: string;
  issuingCountry: string;
  issueDate?: string;
  expiryDate?: string;

  documentPath: string;
  selfiePath: string;

  status: KycStatus;
  rejectionReason?: string;

  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const KycRequestSchema = new Schema<IKycRequest>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    dateOfBirth: {
      type: String,
      required: true,
      trim: true,
    },

    nationality: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    documentType: {
      type: String,
      enum: ["passport", "national_id"],
      required: true,
    },

    documentNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    issuingCountry: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    issueDate: String,
    expiryDate: String,

    documentPath: {
      type: String,
      required: true,
    },

    selfiePath: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    reviewedAt: Date,
  },
  {
    timestamps: true,
  }
);

KycRequestSchema.index({ userId: 1, createdAt: -1 });
KycRequestSchema.index({ status: 1, createdAt: -1 });

const KycRequest: Model<IKycRequest> =
  mongoose.models.KycRequest ||
  mongoose.model<IKycRequest>("KycRequest", KycRequestSchema);

export default KycRequest;