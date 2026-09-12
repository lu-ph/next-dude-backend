import type { FastifyBaseLogger } from "fastify"
import { WebSocket } from "ws"
import {
  AgentMessageType,
  type BackendMessage,
  type ClientMessage,
  type MessageTypeOf,
} from "../types/agent-types.js"
import { getAIConfig } from "../utils/env-util.js"
import { logWsSend } from "../utils/log.js"
import { sessionManager } from "../session/session.js"

export type MessageHandler<T extends AgentMessageType> = (
  ws: WebSocket,
  message: MessageTypeOf<T>,
  logger: FastifyBaseLogger,
) => Promise<void> | void

export class AgentDispatcher {
  private handlers = new Map<AgentMessageType, MessageHandler<any>>()

  constructor() {
    this.registerDefaultHandlers()
  }

  public register<T extends AgentMessageType>(
    type: T,
    handler: MessageHandler<T>,
  ): this {
    this.handlers.set(type, handler)
    return this
  }

  public async dispatch(
    ws: WebSocket,
    message: ClientMessage,
    logger: FastifyBaseLogger,
  ): Promise<void> {
    const handler = this.handlers.get(message.type)
    if (!handler) {
      logger.warn({ type: message.type }, "Unhandled message type")
      return
    }
    await handler(ws, message, logger)
  }

  public static send<P>(ws: WebSocket, response: BackendMessage<P>): void {
    if (ws.readyState === WebSocket.OPEN) {
      logWsSend(response, { mode: "agentDispatcher" })
      ws.send(JSON.stringify(response))
    }
  }

  private registerDefaultHandlers(): void {
    this.register(AgentMessageType.CHAT_REQUEST, async (ws, msg, logger) => {
      const llmConfig = getAIConfig()

      const sessionId = msg.payload.sessionId
      const session = sessionManager.getSession(sessionId)
      if (!session) {
        AgentDispatcher.send(ws, {
          type: AgentMessageType.ERROR,
          payload: { error: "Session not found" },
        })
        return
      }

      sessionManager.registerConnection(sessionId, ws)
      const agent = session.getOrCreateAgent(llmConfig)

      await agent.sendMessage({
        prompt: msg.payload.prompt,
        images: msg.payload.images,
      })
    })

    this.register(AgentMessageType.CHAT_INTERRUPT, (ws, _msg, logger) => {
      logger.info("Chat interrupted")

      AgentDispatcher.send(ws, {
        type: AgentMessageType.SYSTEM,
        payload: { message: "Interrupted successfully" },
      })
    })
  }
}
