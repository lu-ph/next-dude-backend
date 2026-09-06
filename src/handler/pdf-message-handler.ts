import type { FastifyBaseLogger } from "fastify"
import { WebSocket } from "ws"
import { randomUUID } from "crypto"
import {
  PDFMessageType,
  PDFClientToBackendSchema,
  type PDFClientToBackendMessage,
} from "../types/pdf-types.js"
import { sendAndWait, sendOnly } from "../utils/ws-messenger.js"

type MessageTypeOf<T extends PDFMessageType> = Extract<
  PDFClientToBackendMessage,
  { type: T }
>

export type PDFMessageHandler<T extends PDFMessageType> = (
  ws: WebSocket,
  message: MessageTypeOf<T>,
  logger: FastifyBaseLogger,
) => Promise<void> | void

export class PDFViewerMessageHandler {
  private handlers = new Map<PDFMessageType, PDFMessageHandler<any>>()

  constructor() {
    this.registerDefaultHandlers()
  }

  public register<T extends PDFMessageType>(
    type: T,
    handler: PDFMessageHandler<T>,
  ): this {
    this.handlers.set(type, handler)
    return this
  }

  public async dispatch(
    ws: WebSocket,
    rawMessage: unknown,
    logger: FastifyBaseLogger,
  ): Promise<void> {
    const parseResult = PDFClientToBackendSchema.safeParse(rawMessage)

    if (!parseResult.success) {
      logger.warn({ errors: parseResult.error.format() }, "PDF 消息校验失败")
      sendOnly(ws, {
        type: PDFMessageType.ERROR,
        payload: { error: "Invalid message payload", code: "BAD_REQUEST" },
      })
      return
    }

    const message = parseResult.data
    const handler = this.handlers.get(message.type)

    if (!handler) {
      logger.warn({ type: message.type }, "未找到匹配的 PDF 消息处理器")
      return
    }

    try {
      await handler(ws, message, logger)
    } catch (err: any) {
      logger.error({ err, type: message.type }, "处理 PDF 消息出错")
      sendOnly(ws, {
        type: PDFMessageType.ERROR,
        ...(message.id !== undefined ? { id: message.id } : {}),
        payload: {
          error: err?.message || "Internal error",
          code: "HANDLER_ERROR",
        },
      })
    }
  }

  public async commandJumpToPage(
    ws: WebSocket,
    pageNum: number,
  ): Promise<boolean> {
    try {
      await sendAndWait(
        ws,
        {
          type: PDFMessageType.JUMP_TO_PAGE,
          payload: { pageNum },
        },
        {
          matchType: PDFMessageType.JUMP_TO_PAGE_DONE,
          timeoutMs: 5000,
        },
      )
      return true
    } catch (error) {
      return false
    }
  }

  private registerDefaultHandlers(): void {
    this.register(PDFMessageType.BUFFER, async (ws, msg, logger) => {
      logger.info("收到前端上传的 PDF Buffer 字节流")
    })

    this.register(PDFMessageType.JUMP_TO_PAGE_DONE, (_ws, msg, logger) => {
      logger.info(`收到前端 UI 的跳转完成通知: 页码 ${msg.payload.pageNum}`)
    })
  }
}
