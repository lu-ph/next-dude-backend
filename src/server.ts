import Fastify from "fastify"
import fastifyWebsocket from "@fastify/websocket"
import { websocketRoutes } from "./routes/ws.js"

const app = Fastify({ logger: true })

await app.register(fastifyWebsocket, {
  options: { maxPayload: 100000 * 1024 },
})

await app.register(websocketRoutes)

try {
  const host = process.env.HOST ?? "0.0.0.0"
  const port = Number(process.env.PORT ?? 8080)

  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
