import mongoose, { Schema, Model, Document } from "mongoose";

export interface ICertificate extends Document {
  userId: mongoose.Types.ObjectId;
  type: "account" | "trading" | "asset";
  title: string;
  referenceId: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

const CertificateSchema = new Schema<ICertificate>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["account", "trading", "asset"],
      required: true,
    },
    title: { type: String, required: true },
    referenceId: { type: String, required: true, unique: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default (mongoose.models.Certificate as Model<ICertificate>) ||
  mongoose.model<ICertificate>("Certificate", CertificateSchema);