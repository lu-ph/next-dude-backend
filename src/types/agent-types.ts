import z from "zod"

export interface McpToolResult {
  [x: string]: unknown
  isError?: boolean
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >
}

export interface AIConfig {
  modelName: string
  apiKey: string
  baseUrl: string
}

export enum AgentMessageType {
  // Client -> Backend
  CREATE_SESSION = "agent:create_session",
  CHAT_REQUEST = "agent:chat_request",
  CHAT_INTERRUPT = "agent:chat_interrupt",

  // Backend -> Client
  TEXT_DELTA = "agent:text_delta",
  TOOL_CALL = "agent:tool_call",
  TOOL_RESULT = "agent:tool_result",
  FINAL = "agent:final",
  ERROR = "agent:error",
  SYSTEM = "agent:system",
  WAIT_FOR_PROMPT = "agent:wait_for_prompt",
  PROMPT = "agent:prompt",
  SESSION_CREATED = "agent:session_created",
}

const ImageBase64Schema = z.string().min(1, "Image data cannot be empty")

const PdfInputSchema = z.object({
  filename: z.string().min(1, "PDF filename cannot be empty"),
  data: z.string().min(1, "PDF data cannot be empty"),
})

export const CreateSessionSchema = z.object({
  type: z.literal(AgentMessageType.CREATE_SESSION),
  id: z.string().optional(),
  payload: z.object({
    prompt: z.string().min(1, "Prompt cannot be empty"),
    pdf: PdfInputSchema,
    images: z.array(ImageBase64Schema).default([]),
  }),
})

export const ChatRequestSchema = z.object({
  type: z.literal(AgentMessageType.CHAT_REQUEST),
  id: z.string().optional(),
  payload: z.object({
    prompt: z.string().min(1, "Prompt cannot be empty"),
    sessionId: z.string().optional(),
    images: z.array(ImageBase64Schema).default([]),
  }),
})

export const ChatInterruptSchema = z.object({
  type: z.literal(AgentMessageType.CHAT_INTERRUPT),
  id: z.string().optional(),
  payload: z.object({ reason: z.string().optional() }).optional(),
})

export const ClientMessageSchema = z.discriminatedUnion("type", [
  CreateSessionSchema,
  ChatRequestSchema,
  ChatInterruptSchema,
])

export type ClientMessage = z.infer<typeof ClientMessageSchema>
export type MessageTypeOf<T extends AgentMessageType> = Extract<
  ClientMessage,
  { type: T }
>

export interface BackendMessage<P = unknown> {
  type: AgentMessageType
  id?: string
  payload: P
}

export interface AgentInput {
  prompt: string
  images?: string[]
  pdf?: {
    filename: string
    data: string
  }
}

interface BaseMessage<T extends AgentMessageType, P = void> {
  type: T
  id?: string
  payload: P
}

export type AgentChatRequestMessage = BaseMessage<
  AgentMessageType.CHAT_REQUEST,
  { prompt: string; sessionId?: string; images?: string[] }
>

export type AgentCreateSessionMessage = BaseMessage<
  AgentMessageType.CREATE_SESSION,
  { prompt: string; pdf: { filename: string; data: string }; images: string[] }
>

export type AgentChatInterruptMessage = BaseMessage<
  AgentMessageType.CHAT_INTERRUPT,
  { reason?: string }
>

export type AgentChatTextDeltaMessage = BaseMessage<
  AgentMessageType.TEXT_DELTA,
  { sessionId: string; text: string }
>

export type AgentToolCallMessage = BaseMessage<
  AgentMessageType.TOOL_CALL,
  { name: string; id: string; input: Record<string, unknown> }
>

export type AgentToolResultMessage = BaseMessage<
  AgentMessageType.TOOL_RESULT,
  { id: string; name: string; result: unknown; error?: string }
>

export type AgentFinalMessage = BaseMessage<
  AgentMessageType.FINAL,
  { sessionId: string; success: boolean; cost?: string; duration?: string }
>

export type AgentErrorMessage = BaseMessage<
  AgentMessageType.ERROR,
  { error: string; code?: string }
>

export type AgentSystemMessage = BaseMessage<
  AgentMessageType.SYSTEM,
  { message: string }
>

export type AgentWaitPromptMessage = BaseMessage<
  AgentMessageType.WAIT_FOR_PROMPT,
  Record<string, never> | void
>

export type AgentPromptMessage = BaseMessage<
  AgentMessageType.PROMPT,
  { prompt: string }
>

export type AgentSessionCreatedMessage = BaseMessage<
  AgentMessageType.SESSION_CREATED,
  { sessionId: string }
>

export type AgentClientToBackendMessage =
  | AgentCreateSessionMessage
  | AgentChatRequestMessage
  | AgentChatInterruptMessage

export type AgentBackendToClientMessage =
  | AgentToolCallMessage
  | AgentToolResultMessage
  | AgentFinalMessage
  | AgentErrorMessage
  | AgentSystemMessage
  | AgentWaitPromptMessage
  | AgentPromptMessage
  | AgentChatTextDeltaMessage
  | AgentSessionCreatedMessage

export type AgentWebSocketMessage =
  AgentClientToBackendMessage | AgentBackendToClientMessage
