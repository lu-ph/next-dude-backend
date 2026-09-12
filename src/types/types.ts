import type {
  AgentBackendToClientMessage,
  AgentClientToBackendMessage,
  AgentWebSocketMessage,
} from "./agent-types.js"
import type {
  PDFBackendToClientMessage,
  PDFClientToBackendMessage,
  PDFWebSocketMessage,
} from "./pdf-types.js"
import WebSocket from "ws"

export type WebsocketMessage = PDFWebSocketMessage | AgentWebSocketMessage

export type ClientToBackendMessage =
  PDFClientToBackendMessage | AgentClientToBackendMessage

export type BackendToClientMessage =
  AgentBackendToClientMessage | PDFBackendToClientMessage

export interface WsContext {
  readonly sessionId: string
  current: WebSocket | null
}
