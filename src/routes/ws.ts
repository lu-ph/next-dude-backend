import type { FastifyPluginAsync } from "fastify"
import type { WebSocket } from "ws"
import { AgentDispatcher } from "../handler/agent-message-handler.js"
import { sessionManager } from "../session/session.js"
import { AgentMessageType, ClientMessageSchema } from "../types/agent-types.js"
import { logAgentError, logWsReceive } from "../utils/log.js"

interface ExtWebSocket extends WebSocket {
  isAlive?: boolean
}

export const websocketRoutes: FastifyPluginAsync = async (fastify) => {
  const dispatcher = new AgentDispatcher()

  // heatbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    fastify.websocketServer.clients.forEach((client: ExtWebSocket) => {
      if (client.isAlive === false) return client.terminate()
      client.isAlive = false
      client.ping()
    })
  }, 30000)

  fastify.addHook("onClose", () => clearInterval(heartbeatInterval))

  // websocket routes
  fastify.get<{ Querystring: { sessionId?: string } }>(
    "/ws",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const sessionId = request.query.sessionId

        if (!sessionId) {
          return reply.code(400).send({
            error: "sessionId query parameter is required",
          })
        }

        if (!sessionManager.getSession(sessionId)) {
          return reply.code(404).send({ error: "Session not found" })
        }
      },
    },
    (connection, request) => {
      const socket: ExtWebSocket = connection
      socket.isAlive = true

      sessionManager.registerConnection(request.query.sessionId!, socket)

      socket.on("pong", () => {
        socket.isAlive = true
      })

      socket.on("close", () => {
        sessionManager.removeConnection(socket)
      })

      socket.on("message", async (rawData: Buffer) => {
        try {
          logWsReceive(rawData.toString("utf-8"), { route: "/ws" })
          const rawJson = JSON.parse(rawData.toString("utf-8"))

          const parseResult = ClientMessageSchema.safeParse(rawJson)

          if (!parseResult.success) {
            AgentDispatcher.send(socket, {
              type: AgentMessageType.ERROR,
              payload: {
                error: "Invalid protocol frame",
                details: parseResult.error.format(),
              },
            })
            return
          }

          await dispatcher.dispatch(socket, parseResult.data, fastify.log)
        } catch (err) {
          logAgentError(err, {
            route: "/ws",
            phase: "message parsing or dispatch",
          })
          AgentDispatcher.send(socket, {
            type: AgentMessageType.ERROR,
            payload: { error: "Payload must be a valid JSON string" },
          })
        }
      })
    },
  )
}
