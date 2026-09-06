import Fastify from "fastify"
import fastifyWebsocket from "@fastify/websocket"
import { websocketRoutes } from "./routes/ws.js"

const app = Fastify({ logger: true })

await app.register(fastifyWebsocket, {
  options: { maxPayload: 100000 * 1024 },
})

await app.register(websocketRoutes)

try {
  await app.listen({ port: 8080, host: "0.0.0.0" })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
