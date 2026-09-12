import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"

export class PDFContext {
  public pdfName: string = ""
  public absolutePath: string = ""
  public currentPage: number = 1
  public totalPages: number = 0

  private loading: boolean = false
  private docInstance: pdfjs.PDFDocumentProxy | null = null
  private loadingTask: pdfjs.PDFDocumentLoadingTask | null = null

  public init(pdfName: string, absolutePath: string): void {
    if (this.pdfName !== pdfName && this.loadingTask) {
      void this.loadingTask.destroy()
      this.docInstance = null
    }
    this.pdfName = pdfName
    this.absolutePath = absolutePath
    this.currentPage = 1
  }

  public async loadInstance(): Promise<pdfjs.PDFDocumentProxy> {
    if (!this.absolutePath) throw new Error("PDF not initialized")
    if (this.docInstance) return this.docInstance
    if (this.loading) {
      while (this.loading) await new Promise((r) => setTimeout(r, 100))
      return this.docInstance!
    }

    this.loading = true
    try {
      this.loadingTask = pdfjs.getDocument({ url: this.absolutePath })
      const doc = await this.loadingTask.promise
      this.docInstance = doc
      this.totalPages = doc.numPages
      return doc
    } finally {
      this.loading = false
    }
  }

  public updatePage(pageNum: number): void {
    this.currentPage = pageNum
  }

  public destroy(): void {
    if (this.loadingTask) {
      void this.loadingTask.destroy()
    }
    this.docInstance = null
  }
}
