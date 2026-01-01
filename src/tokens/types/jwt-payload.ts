export interface JwtPayload {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat: number
  nbf?: number
  jti?: string
  [key: string]: unknown
}
