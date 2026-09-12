import { AgentMessageType, type AIConfig } from "../types/agent-types.js"
import { logAgentError } from "../utils/log.js"
import { sendOnly } from "../utils/ws-messenger.js"
import type { Agent } from "./agent.js"
import WebSocket from "ws"

interface Session {
  ws: WebSocket | null
  lastAccessedAt: number
  agent: Agent | null
  readonly sessionId: string
  touch(): void
  getOrCreateAgent(llmConfig: AIConfig): Agent
  destroy(): Promise<void>
}

export async function consumeAgentStream(session: Session) {
  if (!session.agent) return

  try {
    for await (const chunk of session.agent.getOutputStream()) {
      const ws = session.ws
      if (!ws) continue

      for (const message of getBackendMessages(chunk, session.sessionId)) {
        sendOnly(ws, message)
      }

      if (chunk.type === "result") {
        if (chunk.is_error) {
          logAgentError(chunk, {
            sessionId: session.sessionId,
            phase: "agent result",
          })
        }

        sendOnly(ws, {
          type: AgentMessageType.FINAL,
          payload: {
            sessionId: session.sessionId,
            success: !chunk.is_error,
            ...(typeof chunk.total_cost_usd === "number"
              ? { cost: String(chunk.total_cost_usd) }
              : {}),
            ...(typeof chunk.duration_ms === "number"
              ? { duration: String(chunk.duration_ms) }
              : {}),
          },
        })

        if (session.ws === ws) {
          session.ws = null
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, "Agent output complete")
        }
      }
    }
  } catch (err) {
    logAgentError(err, { sessionId: session.sessionId, phase: "agent stream" })
    const ws = session.ws
    if (ws) {
      sendOnly(ws, {
        type: AgentMessageType.ERROR,
        payload: {
          error: err instanceof Error ? err.message : String(err),
          code: "AGENT_STREAM_ERROR",
        },
      })
    }
  }
}

function getBackendMessages(
  chunk: { type?: string; [key: string]: unknown },
  sessionId: string,
): Array<
  | {
      type: AgentMessageType.TEXT_DELTA
      payload: { sessionId: string; text: string }
    }
  | {
      type: AgentMessageType.TOOL_CALL
      payload: { name: string; id: string; input: Record<string, unknown> }
    }
  | {
      type: AgentMessageType.TOOL_RESULT
      payload: { id: string; name: string; result: unknown; error?: string }
    }
> {
  const results: any[] = []

  if (chunk.type === "stream_event" && isRecord(chunk.event)) {
    const event = chunk.event
    if (
      event.type === "content_block_delta" &&
      isRecord(event.delta) &&
      event.delta.type === "text_delta"
    ) {
      results.push({
        type: AgentMessageType.TEXT_DELTA,
        payload: { sessionId, text: String(event.delta.text) },
      })
    }
  }

  if (chunk.type === "assistant" && isRecord(chunk.message)) {
    const content = Array.isArray(chunk.message.content)
      ? chunk.message.content
      : []
    for (const block of content) {
      if (!isRecord(block)) continue
      if (block.type === "tool_use") {
        results.push({
          type: AgentMessageType.TOOL_CALL,
          payload: {
            id: String(block.id),
            name: String(block.name),
            input: isRecord(block.input) ? block.input : {},
          },
        })
      }
    }
  }

  if (chunk.type === "user" && isRecord(chunk.message)) {
    const content = Array.isArray(chunk.message.content)
      ? chunk.message.content
      : []
    for (const block of content) {
      if (!isRecord(block)) continue
      if (block.type === "tool_result") {
        const isError = Boolean(block.is_error)
        results.push({
          type: AgentMessageType.TOOL_RESULT,
          payload: {
            id: String(block.tool_use_id),
            name: String(block.name || "unknown"),
            result: block.content,
            ...(isError
              ? {
                  error:
                    typeof block.content === "string"
                      ? block.content
                      : "Tool execution failed",
                }
              : {}),
          },
        })
      }
    }
  }

  return results
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
