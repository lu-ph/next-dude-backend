import type { WsContext } from "../types/types.js"
import { FileOperation } from "./temporary-files.js"
import WebSocket from "ws"
import path from "path"
import { Agent } from "../agent/agent.js"
import { PDFContext } from "./pdf-context.js"
import type { AIConfig } from "../types/agent-types.js"
import { consumeAgentStream } from "../agent/message-parser.js"
import { generateSessionId } from "../utils/id.js"

export class Session {
  public ws: WebSocket | null = null
  public lastAccessedAt: number
  public readonly fileOps: FileOperation
  public readonly pdfContext: PDFContext
  public agent: Agent | null = null

  constructor(public readonly sessionId: string) {
    this.lastAccessedAt = Date.now()
    this.fileOps = new FileOperation(sessionId)
    this.pdfContext = new PDFContext()
  }

  public touch() {
    this.lastAccessedAt = Date.now()
  }

  public async initializePdf(
    pdfName: string,
    data: Buffer | Uint8Array,
  ): Promise<void> {
    await this.fileOps.createFolder()
    await this.fileOps.addItemToFolder(pdfName, data)
    this.pdfContext.init(
      pdfName,
      path.join(this.fileOps.sessionFolder, path.basename(pdfName)),
    )
    this.touch()
  }

  public getOrCreateAgent(llmConfig: AIConfig): Agent {
    this.touch()
    if (!this.agent) {
      const wsCtx = {
        sessionId: this.sessionId,
        current: this.ws,
      }
      this.agent = new Agent(llmConfig, wsCtx)

      consumeAgentStream(this)
    }
    return this.agent
  }

  public async destroy() {
    if (this.agent) await this.agent.destroy()
    this.pdfContext.destroy()
    this.ws = null

    try {
      await this.fileOps.deleteFolder()
    } catch (err) {
      console.error(`Clean up failed for session ${this.sessionId}`, err)
    }
  }
}

export class SessionManager {
  private static instance: SessionManager
  private sessions = new Map<string, Session>()

  private constructor() {
    setInterval(
      () => this.cleanupExpiredSessions(30 * 60 * 1000),
      10 * 60 * 1000,
    )
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  public getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId)
    if (session) session.touch()
    return session
  }

  public createSession(): Session {
    const sessionId = generateSessionId()
    const session = new Session(sessionId)
    this.sessions.set(sessionId, session)
    return session
  }

  public registerConnection(sessionId: string, ws: WebSocket): void {
    const session = this.getSession(sessionId)
    if (!session) throw new Error("Session not found")
    session.ws = ws
  }

  public removeConnection(ws: WebSocket): void {
    for (const session of this.sessions.values()) {
      if (session.ws === ws) session.ws = null
    }
  }

  public async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      await session.destroy()
      this.sessions.delete(sessionId)
    }
  }

  private cleanupExpiredSessions(maxAgeMs: number): void {
    const now = Date.now()
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt > maxAgeMs) {
        void this.destroySession(sessionId)
      }
    }
  }
}

export const sessionManager = SessionManager.getInstance()
