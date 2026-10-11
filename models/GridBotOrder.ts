import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGridBotOrder extends Document {
  botId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;

  mode: "demo" | "live";
  symbol: string;

  levelIndex: number;
  price: number;
  side: "buy" | "sell";

  handled: boolean;
  handledAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const GridBotOrderSchema =
  new Schema<IGridBotOrder>(
    {
      botId: {
        type: Schema.Types.ObjectId,
        ref: "GridBot",
        required: true,
        index: true,
      },

      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        unique: true,
      },

      mode: {
        type: String,
        enum: ["demo", "live"],
        required: true,
        index: true,
      },

      symbol: {
        type: String,
        required: true,
        uppercase: true,
        index: true,
      },

      levelIndex: {
        type: Number,
        required: true,
      },

      price: {
        type: Number,
        required: true,
        min: 0,
      },

      side: {
        type: String,
        enum: ["buy", "sell"],
        required: true,
      },

      handled: {
        type: Boolean,
        default: false,
        index: true,
      },

      handledAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

GridBotOrderSchema.index({
  botId: 1,
  levelIndex: 1,
  side: 1,
  handled: 1,
});

export default
  (mongoose.models.GridBotOrder as Model<IGridBotOrder>) ||
  mongoose.model<IGridBotOrder>(
    "GridBotOrder",
    GridBotOrderSchema
  );
