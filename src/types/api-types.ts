export interface CreateSessionHeaders {
  "x-filename"?: string
}

export type CreateSessionRequest = Buffer | undefined

export interface CreateSessionResponse {
  sessionId: string
  filename?: string
}

export interface ApiErrorResponse {
  error: string
}
