import path from "path"
import fs from "fs/promises"

const ROOT_DIR = path.join(process.cwd(), "session-files")

type GetFolderItemsOptions = {
  fileType?: "pdf" | "image" | "all"
  fullPath?: boolean
}

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
])

export class FileOperation {
  public readonly sessionId: string
  public readonly sessionFolder: string

  constructor(sessionId: string) {
    this.sessionId = this.sanitizeSessionId(sessionId)
    this.sessionFolder = path.join(ROOT_DIR, this.sessionId)
  }

  private sanitizeSessionId(sessionId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      throw new Error("invalid sessionId")
    }
    return sessionId
  }

  private sanitizeFilename(filename: string): string {
    const safeName = path.basename(filename)
    if (!safeName || safeName === "." || safeName === "..") {
      throw new Error("invalid filename")
    }
    return safeName
  }

  public async createFolder(): Promise<string> {
    await fs.mkdir(this.sessionFolder, { recursive: true })
    return this.sessionFolder
  }

  public async getFolderItemsList(
    options?: GetFolderItemsOptions,
  ): Promise<string[]> {
    try {
      await fs.access(this.sessionFolder)
    } catch {
      return []
    }

    const files = await fs.readdir(this.sessionFolder)
    const fileType = options?.fileType ?? "all"
    const fullPath = options?.fullPath ?? false
    const result: string[] = []

    for (const file of files) {
      const ext = path.extname(file).toLowerCase()
      if (fileType === "pdf" && ext !== ".pdf") continue
      if (fileType === "image" && !IMAGE_EXTENSIONS.has(ext)) continue

      if (fullPath) {
        result.push(path.resolve(this.sessionFolder, file))
      } else {
        result.push(file)
      }
    }
    return result
  }

  public async addItemToFolder(
    filename: string,
    data: Buffer | Uint8Array,
  ): Promise<void> {
    const safeName = this.sanitizeFilename(filename)
    const filePath = path.join(this.sessionFolder, safeName)

    await fs.mkdir(this.sessionFolder, { recursive: true })
    await fs.writeFile(filePath, data)
  }

  public async deleteFolder(): Promise<void> {
    try {
      await fs.rm(this.sessionFolder, { recursive: true, force: true })
      console.log(`[FileManager] Session folder deleted: ${this.sessionFolder}`)
    } catch (err: any) {
      console.error(
        `[FileManager] Failed to delete folder for session ${this.sessionId}:`,
        err,
      )
      throw err
    }
  }
}
