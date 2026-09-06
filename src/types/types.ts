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

export type WebsocketMessage = PDFWebSocketMessage | AgentWebSocketMessage

export type ClientToBackendMessage =
  PDFClientToBackendMessage | AgentClientToBackendMessage

export type BackendToClientMessage =
  AgentBackendToClientMessage | PDFBackendToClientMessage
