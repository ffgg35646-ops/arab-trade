
import mongoose, { Schema } from "mongoose";

const IdempotencyKeySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    key: {
      type: String,
      required: true,
      trim: true
    },
    route: {
      type: String,
      required: true
    },
    requestHash: {
      type: String,
      required: true
    },
    responseStatus: {
      type: Number,
      required: true
    },
    responseBody: {
      type: Schema.Types.Mixed,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400
    }
  },
  { versionKey: false }
);

IdempotencyKeySchema.index(
  { userId: 1, route: 1, key: 1 },
  { unique: true }
);

export default mongoose.models.IdempotencyKey ||
  mongoose.model("IdempotencyKey", IdempotencyKeySchema);