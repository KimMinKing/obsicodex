export interface RpcRequest {
  id: number;
  method: string;
  params?: unknown;
}

export interface RpcNotification {
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  id: number;
  result?: unknown;
  error?: unknown;
}

export type RpcMessage = RpcRequest | RpcNotification | RpcResponse | Record<string, unknown>;

export interface CodexEvent {
  type: "message" | "stderr" | "exit" | "error";
  payload: string | RpcMessage | Error | number | null;
}

export type CodexEventHandler = (event: CodexEvent) => void;
