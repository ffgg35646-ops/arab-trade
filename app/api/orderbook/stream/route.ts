import { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { buildOrderBook } from "@/lib/orderbook";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest
) {
  const url =
    new URL(request.url);

  const symbol =
    String(
      url.searchParams.get(
        "symbol"
      ) || ""
    )
      .trim()
      .toUpperCase()
      .replace(/[_/\s-]/g, "");

  const mode = "live";

  const depth =
    Number(
      url.searchParams.get(
        "depth"
      ) || 20
    );

  if (!symbol) {
    return new Response(
      "symbol required",
      {
        status: 400,
      }
    );
  }

  const encoder =
    new TextEncoder();

  let stopped = false;

  const stream =
    new ReadableStream({
      async start(controller) {
        try {
          await connectDB();

          while (!stopped) {
            const data =
              await buildOrderBook(
                symbol,
                mode,
                depth
              );

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify(
                  data
                )}\n\n`
              )
            );

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  1000
                )
            );
          }
        } catch (error) {
          console.error(
            "ORDERBOOK STREAM:",
            error
          );

          try {
            controller.error(
              error
            );
          } catch {}
        }
      },

      cancel() {
        stopped = true;
      },
    });

  return new Response(
    stream,
    {
      headers: {
        "Content-Type":
          "text/event-stream",
        "Cache-Control":
          "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering":
          "no",
      },
    }
  );
}
