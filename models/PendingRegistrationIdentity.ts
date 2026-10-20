import mongoose, { Document, Model, Schema } from "mongoose";

export interface IPendingRegistrationIdentity extends Document {
  registrationId: string;
  identityFrontData: Buffer;
  identityFrontMime: string;
  identityBackData: Buffer;
  identityBackMime: string;
  selfieData: Buffer;
  selfieMime: string;
  expiresAt: Date;
  createdAt: Date;
}

const PendingRegistrationIdentitySchema = new Schema<IPendingRegistrationIdentity>(
  {
    registrationId: { type: String, required: true, unique: true, index: true },
    identityFrontData: { type: Buffer, required: true },
    identityFrontMime: { type: String, required: true },
    identityBackData: { type: Buffer, required: true },
    identityBackMime: { type: String, required: true },
    selfieData: { type: Buffer, required: true },
    selfieMime: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const PendingRegistrationIdentity: Model<IPendingRegistrationIdentity> =
  mongoose.models.PendingRegistrationIdentity ||
  mongoose.model<IPendingRegistrationIdentity>(
    "PendingRegistrationIdentity",
    PendingRegistrationIdentitySchema
  );

export default PendingRegistrationIdentity;
