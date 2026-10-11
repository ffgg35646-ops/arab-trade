import mongoose, { Schema, Document, Model } from "mongoose";

export type GridBotStatus =
  | "stopped"
  | "running"
  | "paused"
  | "error";

export interface IGridBot extends Document {
  userId: mongoose.Types.ObjectId;
  mode: "demo" | "live";
  symbol: string;

  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  quantityPerGrid: number;

  status: GridBotStatus;

  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  stoppedAt?: Date | null;

  lastRunAt?: Date | null;
  lastError?: string;

  stats: {
    ordersPlaced: number;
    ordersCancelled: number;
    tradesDetected: number;
    realizedProfit: number;
  };
}

const GridBotSchema = new Schema<IGridBot>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    mode: {
      type: String,
      enum: ["demo", "live"],
      default: "live",
      required: true,
      index: true,
    },

    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    lowerPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    upperPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    gridCount: {
      type: Number,
      required: true,
      min: 2,
      max: 500,
    },

    quantityPerGrid: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "stopped",
        "running",
        "paused",
        "error",
      ],
      default: "stopped",
      index: true,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    stoppedAt: {
      type: Date,
      default: null,
    },

    lastRunAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: "",
    },

    stats: {
      ordersPlaced: {
        type: Number,
        default: 0,
      },

      ordersCancelled: {
        type: Number,
        default: 0,
      },

      tradesDetected: {
        type: Number,
        default: 0,
      },

      realizedProfit: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

GridBotSchema.index({
  userId: 1,
  mode: 1,
  symbol: 1,
  status: 1,
});

export default
  (mongoose.models.GridBot as Model<IGridBot>) ||
  mongoose.model<IGridBot>(
    "GridBot",
    GridBotSchema
  );
