import mongoose from "mongoose";

import GridBot from "@/models/GridBot";
import GridBotOrder from "@/models/GridBotOrder";
import Asset from "@/models/Asset";
import Order from "@/models/Order";
import Wallet from "@/models/Wallet";
import PlatformSettings from "@/models/PlatformSettings";

import { calculateTradingFee } from "@/lib/fee-engine";
import { matchOrder } from "@/lib/matching-engine";

function validateRange(
  lowerPrice: number,
  upperPrice: number,
  gridCount: number,
  quantityPerGrid: number
) {
  if (!Number.isFinite(lowerPrice) || lowerPrice <= 0) {
    throw new Error("INVALID_LOWER_PRICE");
  }

  if (!Number.isFinite(upperPrice) || upperPrice <= lowerPrice) {
    throw new Error("INVALID_UPPER_PRICE");
  }

  if (
    !Number.isInteger(gridCount) ||
    gridCount < 2 ||
    gridCount > 500
  ) {
    throw new Error("INVALID_GRID_COUNT");
  }

  if (
    !Number.isFinite(quantityPerGrid) ||
    quantityPerGrid <= 0
  ) {
    throw new Error("INVALID_GRID_QUANTITY");
  }
}

function buildGridLevels(
  lowerPrice: number,
  upperPrice: number,
  gridCount: number
) {
  const step =
    (upperPrice - lowerPrice) / (gridCount - 1);

  return Array.from(
    { length: gridCount },
    (_, index) =>
      Number(
        (lowerPrice + step * index).toFixed(12)
      )
  );
}

function splitSymbol(symbol: string) {
  const normalized = symbol.toUpperCase().trim();

  if (normalized.includes("/")) {
    const [base, quote] = normalized.split("/");

    if (!base || !quote) {
      throw new Error("INVALID_SYMBOL");
    }

    return { base, quote };
  }

  const knownQuotes = ["USDT", "USDC", "BTC", "ETH", "BNB"];
  const quote = knownQuotes.find((q) =>
    normalized.endsWith(q)
  );

  if (!quote) {
    throw new Error("INVALID_SYMBOL");
  }

  const base = normalized.slice(
    0,
    -quote.length
  );

  if (!base) {
    throw new Error("INVALID_SYMBOL");
  }

  return { base, quote };
}

function levelSide(
  index: number,
  levels: number[]
): "buy" | "sell" {
  const midpoint =
    (levels.length - 1) / 2;

  return index <= midpoint ? "buy" : "sell";
}

async function createRealGridOrder(input: {
  bot: any;
  levelIndex: number;
  price: number;
  side: "buy" | "sell";
  session: mongoose.ClientSession;
}) {
  const {
    bot,
    levelIndex,
    price,
    side,
    session,
  } = input;

  const { base, quote } =
    splitSymbol(bot.symbol);

  const settings =
    await PlatformSettings.findOne({
      key: "global",
    })
      .session(session)
      .lean();

  const feePercent = Number(
    settings?.trading?.defaultFeePercent ?? 0
  );

  const quantity =
    Number(bot.quantityPerGrid);

  const quoteAmount =
    price * quantity;

  const fee =
    calculateTradingFee(
      quoteAmount,
      feePercent
    );

  if (side === "buy") {
    const wallet =
      await Wallet.findOneAndUpdate(
        {
          userId: bot.userId,
          mode: bot.mode,
          type: "spot",
          balances: {
            $elemMatch: {
              asset: quote,
              available: {
                $gte: quoteAmount + fee,
              },
            },
          },
        },
        {
          $inc: {
            "balances.$.available":
              -(quoteAmount + fee),
            "balances.$.locked":
              quoteAmount + fee,
          },
        },
        {
          new: true,
          session,
        }
      );

    if (!wallet) {
      throw new Error(
        `INSUFFICIENT_${quote}_BALANCE`
      );
    }
  } else {
    const wallet =
      await Wallet.findOneAndUpdate(
        {
          userId: bot.userId,
          mode: bot.mode,
          type: "spot",
          balances: {
            $elemMatch: {
              asset: base,
              available: {
                $gte: quantity,
              },
            },
          },
        },
        {
          $inc: {
            "balances.$.available":
              -quantity,
            "balances.$.locked":
              quantity,
          },
        },
        {
          new: true,
          session,
        }
      );

    if (!wallet) {
      throw new Error(
        `INSUFFICIENT_${base}_BALANCE`
      );
    }
  }

  const [created] =
    await Order.create(
      [
        {
          userId: bot.userId,
          mode: bot.mode,
          symbol: bot.symbol,
          side,
          type: "limit",
          price,
          quantity,
          quoteAmount,
          originalQuantity:
            quantity,
          filledQuantity: 0,
          status: "open",
        },
      ],
      { session }
    );

  await matchOrder(
    String(created._id),
    bot.mode,
    session
  );

  await GridBotOrder.create(
    [
      {
        botId: bot._id,
        userId: bot.userId,
        orderId: created._id,
        mode: bot.mode,
        symbol: bot.symbol,
        levelIndex,
        price,
        side,
      },
    ],
    { session }
  );

  return created;
}


export async function getGridLevels(
  botId: string,
  userId: mongoose.Types.ObjectId
) {
  const bot = await GridBot.findOne({
    _id: botId,
    userId,
  }).lean();

  if (!bot) {
    throw new Error("BOT_NOT_FOUND");
  }

  const levels =
    buildGridLevels(
      bot.lowerPrice,
      bot.upperPrice,
      bot.gridCount
    );

  return {
    botId: String(bot._id),
    symbol: bot.symbol,
    mode: bot.mode,
    levels,
  };
}

export async function createGridBot(input: {
  userId: mongoose.Types.ObjectId;
  mode: "demo" | "live";
  symbol: string;
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  quantityPerGrid: number;
}) {
  const symbol =
    input.symbol.trim().toUpperCase();

  validateRange(
    input.lowerPrice,
    input.upperPrice,
    input.gridCount,
    input.quantityPerGrid
  );

  const { base, quote } =
    splitSymbol(symbol);

  const assets = await Asset.find({
    symbol: {
      $in: [base, quote],
    },
    enabled: true,
    tradingEnabled: true,
  }).lean();

  if (assets.length !== 2) {
    throw new Error(
      "TRADING_PAIR_NOT_AVAILABLE"
    );
  }

  return GridBot.create({
    userId: input.userId,
    mode: input.mode,
    symbol,
    lowerPrice: input.lowerPrice,
    upperPrice: input.upperPrice,
    gridCount: input.gridCount,
    quantityPerGrid: input.quantityPerGrid,
    status: "stopped",
  });
}

export async function startGridBot(
  botId: string,
  userId: mongoose.Types.ObjectId
) {
  const bot = await GridBot.findOne({
    _id: botId,
    userId,
  });

  if (!bot) {
    throw new Error("BOT_NOT_FOUND");
  }

  bot.status = "running";
  bot.startedAt = new Date();
  bot.stoppedAt = null;
  bot.lastError = "";

  await bot.save();

  return bot;
}

export async function stopGridBot(
  botId: string,
  userId: mongoose.Types.ObjectId
) {
  const bot = await GridBot.findOne({
    _id: botId,
    userId,
  });

  if (!bot) {
    throw new Error("BOT_NOT_FOUND");
  }

  bot.status = "stopped";
  bot.stoppedAt = new Date();

  await bot.save();

  return bot;
}

export async function syncGridOrders(
  botId: string,
  userId: mongoose.Types.ObjectId
) {
  const bot =
    await GridBot.findOne({
      _id: botId,
      userId,
      status: "running",
    });

  if (!bot) {
    throw new Error("BOT_NOT_RUNNING");
  }

  const levels =
    buildGridLevels(
      bot.lowerPrice,
      bot.upperPrice,
      bot.gridCount
    );

  const existing =
    await GridBotOrder.find({
      botId: bot._id,
      handled: false,
    })
      .select("levelIndex side")
      .lean();

  const occupied =
    new Set(
      existing.map(
        (item) =>
          `${item.levelIndex}:${item.side}`
      )
    );

  const session =
    await mongoose.startSession();

  const created: Array<{
    levelIndex: number;
    side: "buy" | "sell";
    price: number;
    orderId: string;
  }> = [];

  try {
    await session.withTransaction(
      async () => {
        for (
          let index = 0;
          index < levels.length;
          index += 1
        ) {
          const price = levels[index];
          const side =
            levelSide(index, levels);

          const key =
            `${index}:${side}`;

          if (occupied.has(key)) {
            continue;
          }

          try {
            const order =
              await createRealGridOrder({
                bot,
                levelIndex: index,
                price,
                side,
                session,
              });

            created.push({
              levelIndex: index,
              side,
              price,
              orderId:
                String(order._id),
            });
          } catch (error) {
            /*
             * A grid can legitimately have
             * insufficient balance for one side.
             * Stop filling the remaining levels
             * instead of creating a partial,
             * inconsistent strategy.
             */
            throw error;
          }
        }

        bot.lastRunAt = new Date();
        bot.stats.ordersPlaced +=
          created.length;

        await bot.save({ session });
      }
    );
  } catch (error) {
    bot.status = "error";
    bot.lastError =
      error instanceof Error
        ? error.message
        : "GRID_SYNC_FAILED";

    await bot.save();

    throw error;
  } finally {
    await session.endSession();
  }

  return {
    botId: String(bot._id),
    symbol: bot.symbol,
    mode: bot.mode,
    created,
    totalCreated: created.length,
  };
}

export async function runGridBotCycle(
  botId: string
) {
  const bot =
    await GridBot.findOne({
      _id: botId,
      status: "running",
    });

  if (!bot) {
    return {
      skipped: true,
      reason: "NOT_RUNNING",
    };
  }

  const levels =
    buildGridLevels(
      bot.lowerPrice,
      bot.upperPrice,
      bot.gridCount
    );

  const tracked =
    await GridBotOrder.find({
      botId: bot._id,
      handled: false,
    });

  let handled = 0;
  let replaced = 0;

  for (const trackedOrder of tracked) {
    const order =
      await Order.findById(
        trackedOrder.orderId
      ).lean();

    if (!order) {
      trackedOrder.handled = true;
      trackedOrder.handledAt =
        new Date();
      await trackedOrder.save();
      continue;
    }

    if (order.status !== "filled") {
      continue;
    }

    trackedOrder.handled = true;
    trackedOrder.handledAt =
      new Date();

    await trackedOrder.save();

    handled += 1;

    const nextIndex =
      trackedOrder.side === "buy"
        ? trackedOrder.levelIndex + 1
        : trackedOrder.levelIndex - 1;

    if (
      nextIndex < 0 ||
      nextIndex >= levels.length
    ) {
      continue;
    }

    const nextSide =
      trackedOrder.side === "buy"
        ? "sell"
        : "buy";

    const duplicate =
      await GridBotOrder.findOne({
        botId: bot._id,
        levelIndex: nextIndex,
        side: nextSide,
        handled: false,
      });

    if (duplicate) {
      continue;
    }

    const session =
      await mongoose.startSession();

    try {
      await session.withTransaction(
        async () => {
          await createRealGridOrder({
            bot,
            levelIndex: nextIndex,
            price: levels[nextIndex],
            side: nextSide,
            session,
          });

          bot.stats.ordersPlaced += 1;
          bot.stats.tradesDetected += 1;
          bot.lastRunAt = new Date();

          await bot.save({
            session,
          });
        }
      );

      replaced += 1;
    } catch (error) {
      bot.status = "error";
      bot.lastError =
        error instanceof Error
          ? error.message
          : "GRID_REPLACEMENT_FAILED";

      await bot.save();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  return {
    skipped: false,
    botId: String(bot._id),
    handled,
    replaced,
  };
}

export async function runAllGridBots() {
  const bots =
    await GridBot.find({
      status: "running",
    })
      .select("_id")
      .lean();

  const results = [];

  for (const bot of bots) {
    try {
      results.push(
        await runGridBotCycle(
          String(bot._id)
        )
      );
    } catch (error) {
      results.push({
        botId: String(bot._id),
        error:
          error instanceof Error
            ? error.message
            : "GRID_CYCLE_FAILED",
      });
    }
  }

  return {
    bots: bots.length,
    results,
  };
}
