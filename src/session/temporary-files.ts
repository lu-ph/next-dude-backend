import path from "path"
import fs from "fs/promises"

const ROOT_DIR = path.join(process.cwd(), "session-files")

function sanitizeSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error("invalid sessionId")
  }
  return sessionId
}

function sanitizeFilename(filename: string): string {
  const safeName = path.basename(filename)
  if (!safeName || safeName === "." || safeName === "..") {
    throw new Error("invalid filename")
  }
  return safeName
}

export async function createFolder(sessionId: string): Promise<string> {
  const id = sanitizeSessionId(sessionId)
  const targetFolder = path.join(ROOT_DIR, id)
  await fs.mkdir(targetFolder, { recursive: true })
  return targetFolder
}

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

export async function getFolderItemsList(
  sessionId: string,
  options?: GetFolderItemsOptions,
): Promise<string[]> {
  const id = sanitizeSessionId(sessionId)
  const sessionFolder = path.join(ROOT_DIR, id)

  const files = await fs.readdir(sessionFolder)

  const fileType = options?.fileType ?? "all"
  const fullPath = options?.fullPath ?? false

  const result: string[] = []

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()

    if (fileType === "pdf" && ext !== ".pdf") {
      continue
    }
    if (fileType === "image" && !IMAGE_EXTENSIONS.has(ext)) {
      continue
    }

    if (fullPath) {
      result.push(path.resolve(sessionFolder, file))
    } else {
      result.push(file)
    }
  }

  return result
}

export async function addItemToFolder(
  sessionId: string,
  filename: string,
  data: Buffer | Uint8Array,
): Promise<void> {
  const id = sanitizeSessionId(sessionId)
  const safeName = sanitizeFilename(filename)

  const sessionFolder = path.join(ROOT_DIR, id)
  const filePath = path.join(sessionFolder, safeName)

  await fs.mkdir(sessionFolder, { recursive: true })
  await fs.writeFile(filePath, data)
}
