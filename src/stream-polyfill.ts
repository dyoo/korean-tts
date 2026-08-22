/**
 * Polyfill for `ReadableStream.prototype[Symbol.asyncIterator]` across WebKit/Safari
 * and dedicated Web Worker environments where ReadableStream is not natively async iterable.
 *
 * Background:
 * `phonemizer.js` (a dependency of `kokoro-js`) decompresses bundled phonetic dictionaries
 * upon module evaluation using:
 * `for await (const chunk of blob.stream().pipeThrough(new DecompressionStream("gzip")))`
 *
 * In Safari/WebKit (macOS & iOS) and certain worker execution contexts, `ReadableStream`
 * lacks `[Symbol.asyncIterator]`, which causes `for await` to throw:
 * `TypeError: undefined is not a function (near '...A of e...')`
 *
 * This polyfill installs a standards-compliant async iterator on `ReadableStream.prototype`
 * before third-party TTS libraries are evaluated.
 */

export function polyfillReadableStreamAsyncIterator(): void {
  if (
    typeof ReadableStream !== "undefined" &&
    typeof (ReadableStream.prototype as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] !== "function"
  ) {
    (
      ReadableStream.prototype as unknown as {
        [Symbol.asyncIterator]: <R = unknown>() => AsyncIterableIterator<R>;
      }
    )[Symbol.asyncIterator] = function <R = unknown>(
      this: ReadableStream<R>,
    ): AsyncIterableIterator<R> {
      const reader = this.getReader();

      return {
        async next(): Promise<IteratorResult<R>> {
          try {
            const { done, value } = await reader.read();
            if (done) {
              reader.releaseLock();
              return { done: true, value: undefined };
            }
            return { done: false, value };
          } catch (err) {
            reader.releaseLock();
            throw err;
          }
        },
        async return(): Promise<IteratorResult<R>> {
          try {
            await reader.cancel();
          } finally {
            reader.releaseLock();
          }
          return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    };
  }
}
