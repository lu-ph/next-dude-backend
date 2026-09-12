import Fastify from "fastify"
import fastifyCors from "@fastify/cors"
import fastifyWebsocket from "@fastify/websocket"
import { websocketRoutes } from "./routes/ws.js"
import { createSessionRoutes } from "./routes/api.js"
import { getCorsOrigin } from "./utils/env-util.js";

const app = Fastify({ logger: true, bodyLimit: 500 * 1024 * 1024 })

const allowedOrigins = getCorsOrigin();

await app.register(fastifyCors, {
  origin: allowedOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Filename"],
  credentials: true,
})

app.addContentTypeParser(
  ["application/pdf", "application/octet-stream"],
  { parseAs: "buffer", bodyLimit: 500 * 1024 * 1024 },
  (_request, body, done) => done(null, body),
)

await app.register(fastifyWebsocket, {
  options: { maxPayload: 100000 * 1024 },
})

await app.register(websocketRoutes)
await app.register(createSessionRoutes)

try {
  const host = process.env.HOST ?? "0.0.0.0"
  const port = Number(process.env.PORT ?? 8080)

  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
