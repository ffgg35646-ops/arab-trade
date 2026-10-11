import mongoose, { Schema, Model } from "mongoose";

export interface IOrder {
  userId: mongoose.Types.ObjectId;
  mode: "demo" | "live";
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;

  // الكمية المتبقية غير المنفذة
  quantity: number;

  // قيمة الأمر الأصلية قبل أي تنفيذ
  quoteAmount: number;

  // إجمالي الكمية عند إنشاء الأمر
  originalQuantity?: number;

  // إجمالي الكمية التي تم تنفيذها فعليًا
  filledQuantity?: number;

  status: "open" | "cancelled" | "filled" | "rejected";
  createdAt?: Date;
  updatedAt?: Date;
}

const OrderSchema = new Schema<IOrder>(
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
      index: true,
    },

    symbol: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },

    side: {
      type: String,
      enum: ["buy", "sell"],
      required: true,
    },

    type: {
      type: String,
      enum: ["limit", "market"],
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    /*
     * quantity = المتبقي حاليًا.
     * لذلك بعد تنفيذ جزء من الأمر تنخفض هذه القيمة.
     */
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    /*
     * quoteAmount = القيمة الأصلية الكاملة للأمر.
     */
    quoteAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    /*
     * الحقول الجديدة الخاصة بتتبع التنفيذ.
     * اختيارية حتى تظل الأوامر القديمة قابلة للقراءة.
     */
    originalQuantity: {
      type: Number,
      min: 0,
    },

    filledQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: ["open", "cancelled", "filled", "rejected"],
      default: "open",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ mode: 1, symbol: 1, status: 1, side: 1, createdAt: 1 });

const Order: Model<IOrder> =
  mongoose.models.Order ||
  mongoose.model<IOrder>("Order", OrderSchema);

export default Order;