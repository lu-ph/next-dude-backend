import path from "path"
import { createCanvas } from "@napi-rs/canvas"
import { z } from "zod"
import { WebSocket } from "ws"
import {
  createSdkMcpServer as createMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk"
import type { McpToolResult } from "../../types/agent-types.js"
import {
  PDFMessageType,
} from "../../types/pdf-types.js"
import type { WsContext } from "../../session/agent-session.js"
import { pdfSessionManager } from "../../session/pdf-session.js"
import { getFolderItemsList } from "../../session/temporary-files.js"
import { sendOnly } from "../../utils/ws-messenger.js"

export function createPDFViewerMcpServer(wsCtx: WsContext) {
  return createMcpServer({
    name: "pdf-viewer",
    version: "1.0.0",
    tools: [
      tool(
        "jump_to_page",
        "Jump to a specific PDF page",
        {
          pdfName: z.string().describe("PDF name with file extension."),
          pageNum: z.number().describe("Jump to a specific PDF page."),
        },
        async ({ pdfName, pageNum }) =>
          handleJumpToPage(wsCtx, pdfName, pageNum),
      ),
      tool(
        "next_page",
        "Jump to the next page",
        {
          pdfName: z.string().describe("PDF name with file extension."),
        },
        async ({ pdfName }) => handleNextPage(wsCtx, pdfName),
      ),
      tool(
        "previous_page",
        "Jump to the previous page",
        {
          pdfName: z.string().describe("PDF name with file extension."),
        },
        async ({ pdfName }) => handlePreviousPage(wsCtx, pdfName),
      ),
      tool(
        "list_session_files",
        "List all file names stored in the current session",
        {},
        async () => listSessionFiles(wsCtx),
      ),
    ],
  })
}

function getActiveSocket(wsCtx: WsContext): WebSocket {
  const ws = wsCtx.current
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error(
      "WebSocket connection is offline or disconnected. Cannot execute PDF tool.",
    )
  }
  return ws
}

async function loadPDFPage(
  pdfName: string,
  pageNum: number,
  wsCtx: WsContext,
) {
  const session = pdfSessionManager.getSession(wsCtx.sessionId)
  if (!session || session.pdfName !== path.basename(pdfName)) {
    throw new Error(`PDF session not found for ${pdfName}`)
  }

  const document = await pdfSessionManager.loadInstance(session)
  if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > document.numPages) {
    throw new Error(`PDF page ${pageNum} is out of range`)
  }

  return { session, page: await document.getPage(pageNum) }
}

async function getLocalPDFPage(
  pdfName: string,
  pageNum: number,
  wsCtx: WsContext,
): Promise<McpToolResult> {
  try {
    const { page } = await loadPDFPage(pdfName, pageNum, wsCtx)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    )
    const context = canvas.getContext("2d")

    await page.render({
      canvas: canvas as any,
      canvasContext: context as any,
      viewport,
    }).promise

    return {
      content: [{
        type: "image",
        data: canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, ""),
        mimeType: "image/png",
      }],
    }
  } catch (error: unknown) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Failed to render PDF page ${pageNum}: ${error instanceof Error ? error.message : String(error)}`,
      }],
    }
  }
}

async function listSessionFiles(wsCtx: WsContext): Promise<McpToolResult> {
  try {
    const files = await getFolderItemsList(wsCtx.sessionId)
    return {
      content: [{ type: "text", text: files.join("\n") || "No files found" }],
    }
  } catch (error: unknown) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Failed to list session files: ${error instanceof Error ? error.message : String(error)}`,
      }],
    }
  }
}

async function handleJumpToPage(
  wsCtx: WsContext,
  pdfName: string,
  pageNum: number,
): Promise<McpToolResult> {
  try {
    const { session } = await loadPDFPage(pdfName, pageNum, wsCtx)
    const ws = getActiveSocket(wsCtx)
    sendOnly(ws, {
      type: PDFMessageType.JUMP_TO_PAGE,
      payload: { pageNum },
    })
    pdfSessionManager.updatePage(session.sessionId, pageNum)
    return getLocalPDFPage(pdfName, pageNum, wsCtx)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [
        { type: "text", text: `Failed to jump to page ${pageNum}: ${message}` },
      ],
    }
  }
}

async function handleNextPage(
  wsCtx: WsContext,
  pdfName: string,
): Promise<McpToolResult> {
  try {
    const session = pdfSessionManager.getSession(wsCtx.sessionId)
    if (!session || session.pdfName !== path.basename(pdfName)) {
      throw new Error(`PDF session not found for ${pdfName}`)
    }
    const document = await pdfSessionManager.loadInstance(session)
    const nextPage = Math.min(session.currentPage + 1, document.numPages)
    await document.getPage(nextPage)
    const ws = getActiveSocket(wsCtx)
    sendOnly(ws, { type: PDFMessageType.NEXT_PAGE })
    pdfSessionManager.updatePage(session.sessionId, nextPage)
    return getLocalPDFPage(pdfName, nextPage, wsCtx)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [
        { type: "text", text: `Failed to jump to next page: ${message}` },
      ],
    }
  }
}

async function handlePreviousPage(
  wsCtx: WsContext,
  pdfName: string,
): Promise<McpToolResult> {
  try {
    const session = pdfSessionManager.getSession(wsCtx.sessionId)
    if (!session || session.pdfName !== path.basename(pdfName)) {
      throw new Error(`PDF session not found for ${pdfName}`)
    }
    const previousPage = Math.max(session.currentPage - 1, 1)
    const document = await pdfSessionManager.loadInstance(session)
    await document.getPage(previousPage)
    const ws = getActiveSocket(wsCtx)
    sendOnly(ws, { type: PDFMessageType.PREVIOUS_PAGE })
    pdfSessionManager.updatePage(session.sessionId, previousPage)
    return getLocalPDFPage(pdfName, previousPage, wsCtx)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [
        { type: "text", text: `Failed to jump to previous page: ${message}` },
      ],
    }
  }
}
