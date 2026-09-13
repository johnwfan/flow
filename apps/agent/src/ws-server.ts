import { WebSocketServer, WebSocket } from "ws";
import type { WsMessage, SessionControlMessage } from "@flow/shared";

export interface WsServerOptions {
  port: number;
  onSessionControl?: (msg: SessionControlMessage) => void;
  onServerError?: (err: NodeJS.ErrnoException) => void;
}

export class AgentWsServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private onSessionControl?: (msg: SessionControlMessage) => void;

  constructor(opts: WsServerOptions) {
    this.onSessionControl = opts.onSessionControl;
    this.wss = new WebSocketServer({ port: opts.port });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      console.log(`[ws] client connected (${this.clients.size} total)`);

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsMessage;
          if (msg.kind === "session_control" && this.onSessionControl) {
            this.onSessionControl(msg);
          }
        } catch {
          console.warn("[ws] ignoring malformed message");
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(`[ws] client disconnected (${this.clients.size} total)`);
      });

      ws.on("error", (err) => {
        console.error("[ws] client error:", err.message);
        this.clients.delete(ws);
      });
    });

    this.wss.on("listening", () => {
      console.log(`[ws] server listening on ws://localhost:${opts.port}`);
    });

    this.wss.on("error", (err: NodeJS.ErrnoException) => {
      console.error(`[ws] server error: ${err.message}`);
      opts.onServerError?.(err);
    });
  }

  /** Broadcast a message to all connected clients */
  broadcast(msg: WsMessage): void {
    this.broadcastRaw(msg);
  }

  /**
   * Broadcast an arbitrary JSON object outside the frozen WsMessage
   * contract — for agent-side diagnostics only (e.g. SDK framing hints).
   * Never use this for anything Lane B's UI is expected to rely on.
   */
  broadcastRaw(obj: unknown): void {
    const data = JSON.stringify(obj);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /** Number of connected clients */
  get clientCount(): number {
    return this.clients.size;
  }

  async close(): Promise<void> {
    for (const ws of this.clients) {
      ws.close();
    }
    return new Promise((resolve, reject) => {
      this.wss.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
