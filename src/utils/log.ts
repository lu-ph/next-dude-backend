type LogContext = Record<string, unknown>

const MAX_LOG_STRING_LENGTH = 2000
const BINARY_KEYS = new Set(["data", "buffer"])

export function logWsSend(message: unknown, context?: LogContext): void {
  writeLog("info", "WebSocket send", { ...context, message })
}

export function logWsReceive(message: unknown, context?: LogContext): void {
  writeLog("info", "WebSocket receive", { ...context, message })
}

export function logAgentError(error: unknown, context?: LogContext): void {
  writeLog("error", "Agent error", {
    ...context,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
  })
}

function writeLog(
  level: "info" | "error",
  event: string,
  context: LogContext,
): void {
  const safeContext = sanitize(context) as LogContext
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...safeContext,
  })

  if (level === "error") {
    console.error(payload)
  } else {
    console.log(payload)
  }
}

function sanitize(value: unknown, key?: string, depth = 0): unknown {
  if (key && BINARY_KEYS.has(key) && typeof value === "string") {
    return `[binary data omitted: ${value.length} chars]`
  }

  if (typeof value === "string") {
    return value.length > MAX_LOG_STRING_LENGTH
      ? `${value.slice(0, MAX_LOG_STRING_LENGTH)}... [truncated: ${value.length} chars]`
      : value
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, undefined, depth + 1))
  }

  if (value && typeof value === "object") {
    if (depth > 8) return "[nested value omitted]"

    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitize(entryValue, entryKey, depth + 1),
      ]),
    )
  }

  return value
}
