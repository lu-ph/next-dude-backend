import type { FastifyBaseLogger } from "fastify"
import { WebSocket } from "ws"
import {
  AgentMessageType,
  type BackendMessage,
  type ClientMessage,
  type MessageTypeOf,
} from "../types/agent-types.js"
import { sessionManager } from "../session/agent-session.js"
import { getAIConfig } from "../utils/env-util.js"
import { addItemToFolder, createFolder } from "../session/temporary-files.js"
import { pdfSessionManager } from "../session/pdf-session.js"
import { randomUUID } from "crypto"
import path from "path"

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
      ws.send(JSON.stringify(response))
    }
  }

  private registerDefaultHandlers(): void {
    this.register(AgentMessageType.CREATE_SESSION, async (ws, msg, logger) => {
      const sessionId = randomUUID()
      const llmConfig = getAIConfig()

      const sessionFolder = await createFolder(sessionId)
      const pdfName = path.basename(msg.payload.pdf.filename)
      await addItemToFolder(
        sessionId,
        pdfName,
        Buffer.from(msg.payload.pdf.data.replace(/^data:application\/pdf;base64,/, ""), "base64"),
      )
      pdfSessionManager.getOrCreateSession(
        sessionId,
        pdfName,
        path.join(sessionFolder, pdfName),
      )

      sessionManager.registerConnection(sessionId, ws)
      const agent = sessionManager.getOrCreateAgent(sessionId, llmConfig)

      AgentDispatcher.send(ws, {
        type: AgentMessageType.SESSION_CREATED,
        ...(msg.id ? { id: msg.id } : {}),
        payload: { sessionId },
      })

      await agent.sendMessage({
        prompt: msg.payload.prompt,
        pdf: msg.payload.pdf,
        images: msg.payload.images,
      })
    })

    this.register(AgentMessageType.CHAT_REQUEST, async (ws, msg, logger) => {
      const sessionId = msg.payload.sessionId ?? ws.url
      const llmConfig = getAIConfig()

      sessionManager.registerConnection(sessionId, ws)
      const agent = sessionManager.getOrCreateAgent(
        sessionId,
        llmConfig,
        msg.payload.sessionId,
      )
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
