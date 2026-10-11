
import { Types } from "mongoose";
import Order from "@/models/Order";
import Trade from "@/models/Trade";
import {
  consumeLocked,
  credit
} from "@/lib/exchange-settlement";
import {
  fee,
  money
} from "@/lib/exchange-math";

export async function settleSpotTrade(args: {
  buyerOrderId: Types.ObjectId;
  sellerOrderId: Types.ObjectId;
  buyerUserId: Types.ObjectId;
  sellerUserId: Types.ObjectId;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  quantity: number;
  feePercent: number;
}) {
  const quoteAmount = money(
    args.price * args.quantity
  );

  const buyerFee = fee(
    quoteAmount,
    args.feePercent
  );

  const sellerFee = fee(
    quoteAmount,
    args.feePercent
  );

  await consumeLocked(
    args.buyerUserId,
    args.quoteAsset,
    money(quoteAmount + buyerFee)
  );

  await consumeLocked(
    args.sellerUserId,
    args.baseAsset,
    args.quantity
  );

  await credit(
    args.buyerUserId,
    args.baseAsset,
    args.quantity,
    "trade",
    `TRADE:${args.buyerOrderId}:${args.sellerOrderId}`,
    "Spot trade settlement"
  );

  await credit(
    args.sellerUserId,
    args.quoteAsset,
    money(quoteAmount - sellerFee),
    "trade",
    `TRADE:${args.buyerOrderId}:${args.sellerOrderId}`,
    "Spot trade settlement"
  );

  const trade = await Trade.create({
    buyOrderId: args.buyerOrderId,
    sellOrderId: args.sellerOrderId,
    buyerId: args.buyerUserId,
    sellerId: args.sellerUserId,
    price: args.price,
    quantity: args.quantity,
    quoteAmount,
    feeBuyer: buyerFee,
    feeSeller: sellerFee,
    buyerFeeAsset: args.quoteAsset,
    sellerFeeAsset: args.quoteAsset
  });

  return {
    trade,
    quoteAmount,
    buyerFee,
    sellerFee
  };
}