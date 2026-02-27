declare module 'hono' {
  interface ContextVariableMap {
    accessTokenPayload: {
      sub: string
      scope?: string
      client_id?: string
      iss?: string
      aud?: string | string[]
      exp?: number
      iat?: number
      nbf?: number
    }
  }
}

export {}
