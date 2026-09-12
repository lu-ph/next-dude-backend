import { query, type Query } from "@anthropic-ai/claude-agent-sdk"
import { createPDFViewerMcpServer } from "./mcp/pdf-viewer.js"
import type { AgentInput, AIConfig } from "../types/agent-types.js"
import type { WsContext } from "../types/types.js"
import { logAgentError } from "../utils/log.js"

type UserContentBlock =
  | { type: "text"; text: string }
  | {
      type: "document"
      source: { type: "base64"; media_type: "application/pdf"; data: string }
      title?: string
    }
  | {
      type: "image"
      source: {
        type: "base64"
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
        data: string
      }
    }

interface UserMessage {
  type: "user"
  message: { role: "user"; content: string | UserContentBlock[] }
  parent_tool_use_id: null
}

class MessageQueue {
  private messages: UserMessage[] = []
  private waiting: ((msg: UserMessage | null) => void) | null = null
  private closed = false

  push(input: AgentInput): void {
    if (this.closed) return

    const content: UserContentBlock[] = [{ type: "text", text: input.prompt }]

    if (input.pdf) {
      content.push({
        type: "document",
        title: input.pdf.filename,
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: stripDataUrl(input.pdf.data),
        },
      })
    }

    for (const image of input.images ?? []) {
      content.push({ type: "image", source: parseImage(image) })
    }

    const msg: UserMessage = {
      type: "user",
      message: { role: "user", content },
      parent_tool_use_id: null,
    }

    if (this.waiting) {
      this.waiting(msg)
      this.waiting = null
    } else {
      this.messages.push(msg)
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<UserMessage> {
    while (!this.closed) {
      if (this.messages.length > 0) {
        yield this.messages.shift()!
      } else {
        const msg = await new Promise<UserMessage | null>((resolve) => {
          this.waiting = resolve
        })
        if (msg === null) break
        yield msg
      }
    }
  }

  close(): void {
    this.closed = true
    if (this.waiting) {
      this.waiting(null)
      this.waiting = null
    }
  }
}

export class Agent {
  private sessionId: string | undefined
  private currentQuery: Query | null = null
  private inputQueue = new MessageQueue()
  private wsCtx: WsContext

  constructor(llmConfig: AIConfig, wsCtx: WsContext, sessionId?: string) {
    this.sessionId = sessionId
    this.wsCtx = wsCtx
    try {
      this.init(llmConfig)
    } catch (error: unknown) {
      logAgentError(error, { phase: "agent initialization" })
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error(`Error initializing agent: ${errorMsg}`)
    }
  }

  init(llmConfig: AIConfig): void {
    console.log(`[Agent Created]: ${llmConfig.modelName}, ${llmConfig.baseUrl}`)

    this.currentQuery = query({
      prompt: this.inputQueue as any,
      options: {
        cwd: process.cwd(),
        model: llmConfig.modelName,
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        settingSources: ["project"],
        skills: "all",
        tools: [],
        includePartialMessages: true,
        env: {
          ...process.env,
          ANTHROPIC_AUTH_TOKEN: llmConfig.apiKey,
          ANTHROPIC_BASE_URL: llmConfig.baseUrl,
          ANTHROPIC_API_KEY: "",
          ANTHROPIC_MODEL: llmConfig.modelName,
        },
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["@playwright/mcp@latest"],
          },
          pdfViewer: createPDFViewerMcpServer(this.wsCtx),
        },
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        allowedTools: ["mcp__playwright__*", "mcp__pdf-viewer__*"],
      },
    })
  }

  async *getOutputStream(): AsyncGenerator<any, void, unknown> {
    if (!this.currentQuery) {
      throw new Error("Session not initialized")
    }

    for await (const value of this.currentQuery) {
      if (value?.session_id) {
        this.sessionId = value.session_id
      }
      yield value
    }
  }

  public getSessionId(): string | undefined {
    return this.sessionId
  }

  public async sendMessage(input: AgentInput): Promise<void> {
    this.inputQueue.push(input)
  }

  public reset(): void {
    this.sessionId = undefined
  }

  public async pause(): Promise<void> {
    if (!this.currentQuery) return

    try {
      await this.currentQuery.interrupt()
    } catch (error: unknown) {
      logAgentError(error, { phase: "agent pause" })
      const errorMsg = error instanceof Error ? error.message : String(error)
      throw new Error(`Error while pausing agent: ${errorMsg}`)
    }
  }

  public async destroy(): Promise<void> {
    await this.pause().catch(() => {})

    this.inputQueue.close()
    this.currentQuery = null
  }
}

function stripDataUrl(data: string): string {
  const commaIndex = data.indexOf(",")
  return data.startsWith("data:") && commaIndex >= 0
    ? data.slice(commaIndex + 1)
    : data
}

function parseImage(
  image: string,
): Extract<UserContentBlock, { type: "image" }>["source"] {
  const dataUrlMatch = image.match(
    /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/,
  )

  if (dataUrlMatch) {
    return {
      type: "base64",
      media_type: dataUrlMatch[1] as
        "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: dataUrlMatch[2]!,
    }
  }

  return { type: "base64", media_type: "image/png", data: image }
}
