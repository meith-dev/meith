import type { AgentStreamChunk } from "../types.js";

/**
 * A single-consumer async queue bridging event-driven producers (incoming ACP
 * notifications) to an `async function*` consumer. Producers `push` chunks and
 * call `end()` when finished; the consumer iterates with `for await`.
 */
export class AsyncChunkQueue implements AsyncIterable<AgentStreamChunk> {
  private readonly buffer: AgentStreamChunk[] = [];
  private resolveNext: ((r: IteratorResult<AgentStreamChunk>) => void) | null = null;
  private ended = false;

  push(chunk: AgentStreamChunk): void {
    if (this.ended) return;
    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = null;
      resolve({ value: chunk, done: false });
    } else {
      this.buffer.push(chunk);
    }
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = null;
      resolve({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<AgentStreamChunk> {
    return {
      next: (): Promise<IteratorResult<AgentStreamChunk>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({
            value: this.buffer.shift() as AgentStreamChunk,
            done: false,
          });
        }
        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          this.resolveNext = resolve;
        });
      },
    };
  }
}
