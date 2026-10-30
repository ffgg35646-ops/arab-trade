import mongoose, { Schema } from "mongoose";

const PasswordResetTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  createdAt: { type: Date, default: Date.now },
});
export default mongoose.models.PasswordResetToken || mongoose.model("PasswordResetToken", PasswordResetTokenSchema);
