export interface Client {
  id: string
  secret?: string
  name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  scopes: string[]
  created_at: Date
  updated_at: Date
}
