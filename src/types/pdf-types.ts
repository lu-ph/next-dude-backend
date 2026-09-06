import { z } from "zod"

export enum PDFMessageType {
  // Client -> Backend
  BUFFER = "pdf:buffer", // user send pdf buffer to backend agent
  JUMP_TO_PAGE_DONE = "pdf:jump_to_page_done",
  NEXT_PAGE_DONE = "pdf:next_page_done",
  PREVIOUS_PAGE_DONE = "pdf:previous_page_done",

  // Backend -> Client
  JUMP_TO_PAGE = "pdf:jump_to_page",
  NEXT_PAGE = "pdf:next_page",
  PREVIOUS_PAGE = "pdf:previous_page",

  ERROR = "pdf:error",
}

// --- Client -> Backend Schemas ---

export const PDFBufferSchema = z.object({
  type: z.literal(PDFMessageType.BUFFER),
  id: z.string().optional(),
  payload: z.object({
    buffer: z.string().min(1, "pdf buffer can not be null"), // PDF binary
  }),
})

export const PDFJumpToPageDoneSchema = z.object({
  type: z.literal(PDFMessageType.JUMP_TO_PAGE_DONE),
  id: z.string().optional(),
  payload: z.object({
    pageNum: z.number().int().positive("page number must be greater than 0"),
    currentView: z.string().min(1, "current pdf view can not be null")
  }),
})

export const PDFNextPageDoneSchema = z.object({
  type: z.literal(PDFMessageType.NEXT_PAGE_DONE),
  id: z.string().optional(),
  payload: z.object({
    pageNum: z.number().int().positive("page number must be greater than 0"),
    currentView: z.string().min(1, "current pdf view can not be null")
  }),
})

export const PDFPreviousPageDoneSchema = z.object({
  type: z.literal(PDFMessageType.PREVIOUS_PAGE_DONE),
  id: z.string().optional(),
  payload: z.object({
    pageNum: z.number().int().positive("page number must be greater than 0"),
    currentView: z.string().min(1, "current pdf view can not be null")
  }),
})

// --- Backend -> Client Schemas ---

export const PDFJumpPageSchema = z.object({
  type: z.literal(PDFMessageType.JUMP_TO_PAGE),
  id: z.string().optional(),
  payload: z.object({
    pageNum: z.number().int().positive("page number must be greater than 0"),
  }),
})

export const PDFNextPageSchema = z.object({
  type: z.literal(PDFMessageType.NEXT_PAGE),
  id: z.string().optional(),
  payload: z.record(z.string(), z.never()).optional(),
})

export const PDFPreviousPageSchema = z.object({
  type: z.literal(PDFMessageType.PREVIOUS_PAGE),
  id: z.string().optional(),
  payload: z.record(z.string(), z.never()).optional(),
})

export const PDFErrorSchema = z.object({
  type: z.literal(PDFMessageType.ERROR),
  id: z.string().optional(),
  payload: z.object({
    error: z.string(),
    code: z.string().optional(),
  }),
})

export const PDFClientToBackendSchema = z.discriminatedUnion("type", [
  PDFBufferSchema,
  PDFJumpToPageDoneSchema,
  PDFNextPageDoneSchema,
  PDFPreviousPageDoneSchema,
])

export const PDFBackendToClientSchema = z.discriminatedUnion("type", [
  PDFJumpPageSchema,
  PDFNextPageSchema,
  PDFPreviousPageSchema,
  PDFErrorSchema,
])

export type PDFClientToBackendMessage = z.infer<typeof PDFClientToBackendSchema>
export type PDFBackendToClientMessage = z.infer<typeof PDFBackendToClientSchema>

export type PDFWebSocketMessage =
  PDFClientToBackendMessage | PDFBackendToClientMessage
