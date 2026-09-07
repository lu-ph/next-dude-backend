import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"

export type PDFSession = {
  sessionId: string
  pdfName: string
  absolutePath: string
  currentPage: number
  totalPages: number
  loading: boolean
  docInstance: pdfjs.PDFDocumentProxy
  loadingTask: pdfjs.PDFDocumentLoadingTask | null
  lastAccessedAt: number
}
export class PDFSessionManager {
  private static instance: PDFSessionManager
  private sessions = new Map<string, PDFSession>()

  private constructor() {
    // Start a timer to automatically clean up PDF instances that
    // have been unused for over 30 minutes every 10 minutes
    // to prevent memory leaks.
    setInterval(
      () => this.cleanupExpiredSessions(30 * 60 * 1000),
      10 * 60 * 1000,
    )
  }

  public static getInstance(): PDFSessionManager {
    if (!PDFSessionManager.instance) {
      PDFSessionManager.instance = new PDFSessionManager()
    }
    return PDFSessionManager.instance
  }

  public getOrCreateSession(
    sessionId: string,
    pdfName: string,
    absolutePath: string,
  ): PDFSession | null {
    let session = this.sessions.get(sessionId)

    if (session && session.pdfName !== pdfName) {
      this.destroySession(sessionId)
      session = undefined
    }

    if (!session) {
      session = {
        sessionId,
        pdfName,
        absolutePath,
        currentPage: 1,
        totalPages: 0,
        loading: false,
        docInstance: null as any,
        loadingTask: null,
        lastAccessedAt: Date.now(),
      }
      this.sessions.set(sessionId, session)
    } else {
      session.lastAccessedAt = Date.now()
    }

    return session
  }

  public async loadInstance(
    session: PDFSession,
  ): Promise<pdfjs.PDFDocumentProxy> {
    if (session.docInstance) return session.docInstance
    if (session.loading) {
      while (session.loading) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return session.docInstance
    }

    session.loading = true
    try {
      const loadingTask = pdfjs.getDocument({ url: session.absolutePath })
      session.loadingTask = loadingTask
      const doc = await loadingTask.promise

      session.docInstance = doc
      session.totalPages = doc.numPages
      return doc
    } finally {
      session.loading = false
    }
  }

  public updatePage(sessionId: string, pageNum: number): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.currentPage = pageNum
      session.lastAccessedAt = Date.now()
    }
  }

  public getSession(sessionId: string): PDFSession | undefined {
    const session = this.sessions.get(sessionId)
    if (session) session.lastAccessedAt = Date.now()
    return session
  }

  public destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      void session.loadingTask?.destroy()
      this.sessions.delete(sessionId)
      console.log(`[PDFSessionManager] Session ${sessionId} destroyed.`)
    }
  }

  private cleanupExpiredSessions(maxAgeMs: number): void {
    const now = Date.now()
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt > maxAgeMs) {
        this.destroySession(sessionId)
      }
    }
  }
}

export const pdfSessionManager = PDFSessionManager.getInstance()
