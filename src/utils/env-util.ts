import "dotenv/config"
import type { AIConfig } from "../types/agent-types.js"

const requiredEnvNames = ["API_KEY", "MODEL_NAME", "BASE_URL"] as const

export function getAIConfig(): AIConfig {
  const missing = requiredEnvNames.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`)
  }

  const baseUrl = process.env.BASE_URL!
  try {
    new URL(baseUrl)
  } catch {
    throw new Error("BASE_URL must be a valid URL")
  }

  return {
    apiKey: process.env.API_KEY!,
    modelName: process.env.MODEL_NAME!,
    baseUrl,
  }
}

export function getCorsOrigin(): string[] {
  const originEnv = process.env.CORS_ALLOWED_ORIGINS;
  
  if (!originEnv) {
    throw new Error("env variable CORS_ALLOWED_ORIGINS not set");
  }
  
  if (originEnv.includes(',')) {
    return originEnv.split(',').map(item => item.trim())
  }
  
  return [originEnv.trim()]
}