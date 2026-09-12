import type { FastifyPluginAsync } from "fastify"
import { sessionManager } from "../session/session.js"
import type {
  ApiErrorResponse,
  CreateSessionHeaders,
  CreateSessionRequest,
  CreateSessionResponse,
} from "../types/api-types.js"

const MAX_PDF_SIZE = 500 * 1024 * 1024

export const createSessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Headers: CreateSessionHeaders
    Body: CreateSessionRequest
    Reply: CreateSessionResponse | ApiErrorResponse
  }>("/createsession", { bodyLimit: MAX_PDF_SIZE }, async (request, reply) => {
    const filename = request.headers["x-filename"]
    const session = sessionManager.createSession()

    if (!request.body || request.body.length === 0) {
      return reply.code(200).send({ sessionId: session.sessionId })
    }

    if (filename) {
      try {
        await session.initializePdf(filename, request.body)
        return reply.code(200).send({
          sessionId: session.sessionId,
          filename: session.pdfContext.pdfName,
        })
      } catch (error) {
        await sessionManager.destroySession(session.sessionId)
        request.log.error({ error }, "Failed to upload PDF")
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "Invalid PDF upload",
        })
      }
    }
  })
}
