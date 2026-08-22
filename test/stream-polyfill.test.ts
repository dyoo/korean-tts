import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { polyfillReadableStreamAsyncIterator } from "../src/stream-polyfill.ts";

describe("ReadableStream Async Iterator Polyfill", () => {
  it("should enable for-await-of iteration over ReadableStream", async () => {
    polyfillReadableStreamAsyncIterator();

    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("chunk1");
        controller.enqueue("chunk2");
        controller.enqueue("chunk3");
        controller.close();
      },
    });

    const collected: string[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }

    assert.deepEqual(collected, ["chunk1", "chunk2", "chunk3"]);
  });

  it("should handle early loop termination and cancellation", async () => {
    polyfillReadableStreamAsyncIterator();

    let isCancelled = false;
    const stream = new ReadableStream<number>({
      start(controller) {
        controller.enqueue(10);
        controller.enqueue(20);
        controller.enqueue(30);
      },
      cancel() {
        isCancelled = true;
      },
    });

    const collected: number[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
      if (chunk === 20) {
        break;
      }
    }

    assert.deepEqual(collected, [10, 20]);
    assert.equal(isCancelled, true);
  });
});
