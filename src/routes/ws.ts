import type { FastifyPluginAsync } from "fastify"
import type { WebSocket } from "ws"
import { AgentDispatcher } from "../handler/agent-message-handler.js"
import { AgentMessageType, ClientMessageSchema } from "../types/agent-types.js"

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
  fastify.get("/ws", { websocket: true }, (connection, req) => {
    const socket: ExtWebSocket = connection
    socket.isAlive = true

    socket.on("pong", () => {
      socket.isAlive = true
    })

    socket.on("message", async (rawData: Buffer) => {
      try {
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
        AgentDispatcher.send(socket, {
          type: AgentMessageType.ERROR,
          payload: { error: "Payload must be a valid JSON string" },
        })
      }
    })
  })
}
