import { EventEmitter } from "node:events";
import { NdjsonParser } from "@meith/protocol";

/**
 * A minimal JSON-RPC 2.0 client speaking newline-delimited JSON over a duplex
 * stream pair (a child process's stdin/stdout). This is the wire layer for the
 * Agent Client Protocol (ACP) adapter.
 *
 * Hand-rolled on the shared `NdjsonParser` to stay dependency-light and
 * consistent with the rest of the codebase. It handles:
 * - outbound requests (id-correlated promises) and notifications,
 * - inbound responses (resolving the matching request),
 * - inbound requests/notifications from the peer (emitted for the adapter to
 *   handle, e.g. `session/request_permission`).
 */
export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Stream surface needed from a spawned child process. */
export interface DuplexStreams {
  write: (data: string) => void;
  onData: (cb: (chunk: string | Buffer) => void) => void;
}

export type IncomingRequestHandler = (
  method: string,
  params: unknown,
) => Promise<unknown> | unknown;

export class JsonRpcClient extends EventEmitter {
  private nextId = 1;
  private readonly pending = new Map<
    string | number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private readonly parser: NdjsonParser;
  private requestHandler: IncomingRequestHandler | null = null;
  private closed = false;

  constructor(private readonly streams: DuplexStreams) {
    super();
    this.parser = new NdjsonParser((err, line) => {
      this.emit("parse_error", err, line);
    });
    this.streams.onData((chunk) => {
      for (const msg of this.parser.push(chunk)) {
        this.receive(msg as JsonRpcMessage);
      }
    });
  }

  /** Register a handler for inbound requests from the peer (the agent). */
  onRequest(handler: IncomingRequestHandler): void {
    this.requestHandler = handler;
  }

  /** Send a request and await its correlated response. */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error("JSON-RPC client closed"));
    const id = this.nextId++;
    const frame: JsonRpcMessage = { jsonrpc: "2.0", id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      this.send(frame);
    });
  }

  /** Send a notification (no response expected). */
  notify(method: string, params?: unknown): void {
    if (this.closed) return;
    this.send({ jsonrpc: "2.0", method, params });
  }

  /** Reject all in-flight requests; used when the transport dies. */
  close(reason: string): void {
    this.closed = true;
    for (const { reject } of this.pending.values()) reject(new Error(reason));
    this.pending.clear();
  }

  private send(msg: JsonRpcMessage): void {
    this.streams.write(`${JSON.stringify(msg)}\n`);
  }

  private receive(msg: JsonRpcMessage): void {
    // Response to one of our requests.
    if (msg.id !== undefined && msg.method === undefined) {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        entry.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      } else {
        entry.resolve(msg.result);
      }
      return;
    }

    // Inbound request from the peer (needs a response).
    if (msg.method !== undefined && msg.id !== undefined) {
      void this.handleInbound(msg);
      return;
    }

    // Inbound notification (no id).
    if (msg.method !== undefined) {
      this.emit("notification", msg.method, msg.params);
    }
  }

  private async handleInbound(msg: JsonRpcMessage): Promise<void> {
    const id = msg.id as string | number;
    if (!this.requestHandler) {
      this.send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "No request handler" },
      });
      return;
    }
    try {
      const result = await this.requestHandler(msg.method as string, msg.params);
      this.send({ jsonrpc: "2.0", id, result });
    } catch (err) {
      this.send({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
}
