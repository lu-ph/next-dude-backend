// import type { WebSocket } from "ws"
// import type { AgentInput, AIConfig } from "../types/agent-types.js"
// import { AgentMessageType } from "../types/agent-types.js"
// import { Agent } from "../agent/agent.js"
// import { sendOnly } from "../utils/ws-messenger.js"
// import { logAgentError } from "../utils/log.js"
// import type { WsContext } from "../types/types.js";

// export class AgentSession {
//   private agent: Agent

//   public getOrCreateAgent(
//     sessionId: string,
//     llmConfig: AIConfig,
//     resumeSessionId?: string,
//   ): Agent {
//     let agent = this.sessions.get(sessionId)
//     const wsCtx = this.connections.get(sessionId)

//     if (!wsCtx) throw new Error("WebSocket connection not registered")

//     if (!agent) {
//       agent = new Agent(llmConfig, wsCtx, resumeSessionId)
//       this.sessions.set(sessionId, agent)

//       this.consumeAgentStream(sessionId, agent)
//     }

//     return agent
//   }

//   public async sendMessage(
//     sessionId: string,
//     input: AgentInput,
//   ): Promise<void> {
//     const agent = this.sessions.get(sessionId)
//     if (!agent) throw new Error("Session not found")
//     await agent.sendMessage(input)
//   }

//   public async destroyAgent(sessionId: string): Promise<void> {
//     const agent = this.sessions.get(sessionId)
//     if (agent) {
//       await agent.destroy()
//       this.sessions.delete(sessionId)
//     }
//     this.connections.delete(sessionId)
//   }

//   private async consumeAgentStream(sessionId: string, agent: Agent) {
//     try {
//       for await (const chunk of agent.getOutputStream()) {
//         const wsCtx = this.connections.get(sessionId)
//         if (!wsCtx?.current) continue

//         for (const message of getBackendMessages(chunk, wsCtx.sessionId)) {
//           sendOnly(wsCtx.current, message)
//         }

//         if (chunk.type === "result") {
//           if (chunk.is_error) {
//             logAgentError(chunk, { sessionId, phase: "agent result" })
//           }

//           sendOnly(wsCtx.current, {
//             type: AgentMessageType.FINAL,
//             payload: {
//               sessionId: wsCtx.sessionId,
//               success: !chunk.is_error,
//               ...(typeof chunk.total_cost_usd === "number"
//                 ? { cost: String(chunk.total_cost_usd) }
//                 : {}),
//               ...(typeof chunk.duration_ms === "number"
//                 ? { duration: String(chunk.duration_ms) }
//                 : {}),
//             },
//           })
//         }
//       }
//     } catch (err) {
//       logAgentError(err, { sessionId, phase: "agent stream" })
//       const wsCtx = this.connections.get(sessionId)
//       if (wsCtx?.current) {
//         sendOnly(wsCtx.current, {
//           type: AgentMessageType.ERROR,
//           payload: {
//             error: err instanceof Error ? err.message : String(err),
//             code: "AGENT_STREAM_ERROR",
//           },
//         })
//       }
//     }
//   }
// }

// function getBackendMessages(
//   chunk: { type?: string; [key: string]: unknown },
//   sessionId: string,
// ): Array<
//   | {
//       type: AgentMessageType.TEXT_DELTA
//       payload: { sessionId: string; text: string }
//     }
//   | {
//       type: AgentMessageType.TOOL_CALL
//       payload: { name: string; id: string; input: Record<string, unknown> }
//     }
//   | {
//       type: AgentMessageType.TOOL_RESULT
//       payload: { id: string; name: string; result: unknown; error?: string }
//     }
// > {
//   const results: any[] = []

//   if (chunk.type === "stream_event" && isRecord(chunk.event)) {
//     const event = chunk.event
//     if (
//       event.type === "content_block_delta" &&
//       isRecord(event.delta) &&
//       event.delta.type === "text_delta"
//     ) {
//       results.push({
//         type: AgentMessageType.TEXT_DELTA,
//         payload: { sessionId, text: String(event.delta.text) },
//       })
//     }
//   }

//   if (chunk.type === "assistant" && isRecord(chunk.message)) {
//     const content = Array.isArray(chunk.message.content)
//       ? chunk.message.content
//       : []

//     for (const block of content) {
//       if (!isRecord(block)) continue

//       if (block.type === "tool_use") {
//         results.push({
//           type: AgentMessageType.TOOL_CALL,
//           payload: {
//             id: String(block.id),
//             name: String(block.name),
//             input: isRecord(block.input) ? block.input : {},
//           },
//         })
//       }
//     }
//   }

//   if (chunk.type === "user" && isRecord(chunk.message)) {
//     const content = Array.isArray(chunk.message.content)
//       ? chunk.message.content
//       : []

//     for (const block of content) {
//       if (!isRecord(block)) continue

//       if (block.type === "tool_result") {
//         const isError = Boolean(block.is_error)
//         results.push({
//           type: AgentMessageType.TOOL_RESULT,
//           payload: {
//             id: String(block.tool_use_id),
//             name: String(block.name || "unknown"),
//             result: block.content,
//             ...(isError
//               ? {
//                   error:
//                     typeof block.content === "string"
//                       ? block.content
//                       : "Tool execution failed",
//                 }
//               : {}),
//           },
//         })
//       }
//     }
//   }

//   return results
// }

// function isRecord(value: unknown): value is Record<string, unknown> {
//   return typeof value === "object" && value !== null && !Array.isArray(value)
// }
