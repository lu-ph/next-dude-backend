import { WebSocket } from "ws"
import { randomUUID } from "crypto"
import type {
  BackendToClientMessage,
  ClientToBackendMessage,
} from "../types/types.js"
import { logWsReceive, logWsSend } from "./log.js"

export function sendOnly(ws: WebSocket, message: BackendToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    logWsSend(message, { mode: "sendOnly" })
    ws.send(JSON.stringify(message))
  }
}

export interface SendAndWaitOptions {
  /** expected response type (e.g. PDFMessageType.JUMP_TO_PAGE_DONE) */
  matchType?: string
  /** Expected matching response ID, which defaults to the sent message.id or an automatically generated UUID*/
  matchId?: string
  /** default 10000ms */
  timeoutMs?: number
}

export function sendAndWait<
  T extends ClientToBackendMessage = ClientToBackendMessage,
>(
  ws: WebSocket,
  message: BackendToClientMessage,
  options: SendAndWaitOptions = {},
): Promise<T> {
  const msgId = message.id ?? randomUUID()
  const payloadMessage = { ...message, id: msgId }

  const { matchType, matchId = msgId, timeoutMs = 10000 } = options

  return new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) {
      return reject(new Error("WebSocket connection is not OPEN"))
    }

    let timer: NodeJS.Timeout

    const cleanup = () => {
      clearTimeout(timer)
      ws.off("message", onMessage)
    }

    const onMessage = (rawData: unknown) => {
      try {
        const response = JSON.parse(String(rawData))
        logWsReceive(response, { mode: "sendAndWait" })

        const isMatchedId = matchId ? response.id === matchId : true
        const isMatchedType = matchType ? response.type === matchType : true

        if (isMatchedId && isMatchedType) {
          cleanup()
          resolve(response as T)
        }
      } catch {}
    }

    timer = setTimeout(() => {
      cleanup()
      reject(
        new Error(
          `WebSocket sendAndWait timed out after ${timeoutMs}ms (Sent type: ${payloadMessage.type}, Expected: ${matchType ?? "Any"})`,
        ),
      )
    }, timeoutMs)

    ws.on("message", onMessage)

    try {
      logWsSend(payloadMessage, { mode: "sendAndWait" })
      ws.send(JSON.stringify(payloadMessage))
    } catch (err) {
      cleanup()
      reject(err)
    }
  })
}
